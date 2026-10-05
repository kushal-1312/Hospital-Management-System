const { supabase } = require('../config/supabase');
const crypto = require('crypto');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Utility: Case & Column Conversions ───────────────────────────────────────
const toSnakeCase = str =>
  str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

const toCamelCase = str =>
  str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());

const toTableColumn = (tableName, field) => {
  if (field === '_id' || field === 'id') return 'id';
  if (typeof field === 'string' && field.includes('.')) {
    const parts = field.split('.');
    return parts.map(p => toTableColumn(tableName, p)).join('->>');
  }
  const col = toSnakeCase(field);
  if (tableName === 'invoices' && (col === 'issue_date' || field === 'issueDate')) {
    return 'issued_date';
  }
  return col;
};

const mapKeysToSnake = (obj, tableName = '') => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = toTableColumn(tableName, k);
    result[key] = v;
  }
  return result;
};

const mapKeysToCamel = (obj, tableName = '') => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k === 'id' ? 'id' : toCamelCase(k);
    result[key] = v;
  }
  if (result.id && !result._id) {
    result._id = result.id;
  }
  if (obj.issued_date !== undefined) {
    result.issueDate = obj.issued_date;
  }
  return result;
};

function getNested(obj, path) {
  if (!obj || !path) return undefined;
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function evalExpr(expr, row) {
  if (expr === null || expr === undefined) return null;
  if (typeof expr === 'string') {
    if (expr.startsWith('$')) {
      const field = expr.slice(1);
      return (
        row[field] ??
        row[toCamelCase(field)] ??
        row[toSnakeCase(field)] ??
        (field === 'issueDate' ? row.issued_date : undefined)
      );
    }
    return expr;
  }
  if (typeof expr === 'number' || typeof expr === 'boolean') {
    return expr;
  }
  if (typeof expr === 'object') {
    if (expr.$year) {
      const val = evalExpr(expr.$year, row);
      if (!val) return null;
      return new Date(val).getFullYear();
    }
    if (expr.$month) {
      const val = evalExpr(expr.$month, row);
      if (!val) return null;
      return new Date(val).getMonth() + 1; // MongoDB $month is 1-12
    }
    if (expr.$dayOfMonth) {
      const val = evalExpr(expr.$dayOfMonth, row);
      if (!val) return null;
      return new Date(val).getDate();
    }
    if (expr.$cond) {
      if (Array.isArray(expr.$cond)) {
        const [cond, trueVal, falseVal] = expr.$cond;
        const testRes = evalExpr(cond, row);
        return testRes ? evalExpr(trueVal, row) : evalExpr(falseVal, row);
      }
      if (typeof expr.$cond === 'object') {
        const testRes = evalExpr(expr.$cond.if, row);
        return testRes ? evalExpr(expr.$cond.then, row) : evalExpr(expr.$cond.else, row);
      }
    }
    if (expr.$and && Array.isArray(expr.$and)) {
      return expr.$and.every(clause => Boolean(evalExpr(clause, row)));
    }
    if (expr.$or && Array.isArray(expr.$or)) {
      return expr.$or.some(clause => Boolean(evalExpr(clause, row)));
    }
    if (expr.$lte && Array.isArray(expr.$lte)) {
      const [a, b] = expr.$lte;
      const valA = evalExpr(a, row);
      const valB = evalExpr(b, row);
      return Number(valA) <= Number(valB);
    }
    if (expr.$lt && Array.isArray(expr.$lt)) {
      const [a, b] = expr.$lt;
      const valA = evalExpr(a, row);
      const valB = evalExpr(b, row);
      return Number(valA) < Number(valB);
    }
    if (expr.$gt && Array.isArray(expr.$gt)) {
      const [a, b] = expr.$gt;
      const valA = evalExpr(a, row);
      const valB = evalExpr(b, row);
      return Number(valA) > Number(valB);
    }
    if (expr.$gte && Array.isArray(expr.$gte)) {
      const [a, b] = expr.$gte;
      const valA = evalExpr(a, row);
      const valB = evalExpr(b, row);
      return Number(valA) >= Number(valB);
    }
    if (expr.$eq && Array.isArray(expr.$eq)) {
      const [a, b] = expr.$eq;
      return evalExpr(a, row) === evalExpr(b, row);
    }

    const res = {};
    for (const [k, v] of Object.entries(expr)) {
      res[k] = evalExpr(v, row);
    }
    return res;
  }
  return expr;
}

function matchesJsFilter(row, jsFilters) {
  if (!jsFilters || Object.keys(jsFilters).length === 0) return true;
  for (const [key, val] of Object.entries(jsFilters)) {
    if (key === '$expr') {
      if (!evalExpr(val, row)) return false;
    } else if (val && typeof val === 'object' && val.$elemMatch) {
      const arr = row[key] ?? row[toCamelCase(key)] ?? row[toSnakeCase(key)];
      if (!Array.isArray(arr) || arr.length === 0) return false;
      const matchCriteria = val.$elemMatch;
      const hasMatch = arr.some(item => {
        for (const [mKey, mVal] of Object.entries(matchCriteria)) {
          const itemVal = item[mKey] ?? item[toCamelCase(mKey)] ?? item[toSnakeCase(mKey)];
          if (mVal && typeof mVal === 'object') {
            if (mVal.$gt !== undefined && !(itemVal > mVal.$gt)) return false;
            if (mVal.$gte !== undefined && !(itemVal >= mVal.$gte)) return false;
            if (mVal.$lt !== undefined && !(itemVal < mVal.$lt)) return false;
            if (mVal.$lte !== undefined) {
              const iDate = new Date(itemVal);
              const mDate = new Date(mVal.$lte);
              if (isNaN(iDate.getTime()) ? !(itemVal <= mVal.$lte) : !(iDate <= mDate)) return false;
            }
          } else if (itemVal !== mVal) {
            return false;
          }
        }
        return true;
      });
      if (!hasMatch) return false;
    }
  }
  return true;
}

function applyFiltersToQuery(query, filters, tableName) {
  if (!filters || Object.keys(filters).length === 0) return { query, isInvalidUuid: false, jsFilters: {} };

  const f = { ...filters };
  const jsFilters = {};

  if (f._id !== undefined) {
    f.id = f._id;
    delete f._id;
  }

  // Extract $expr
  if (f.$expr !== undefined) {
    jsFilters.$expr = f.$expr;
    delete f.$expr;
  }

  // Extract $elemMatch
  for (const [k, v] of Object.entries(f)) {
    if (v && typeof v === 'object' && v.$elemMatch) {
      jsFilters[k] = v;
      delete f[k];
    }
  }

  // Quick UUID format check on 'id' filter to prevent Postgres 22P02 error
  if (f.id !== undefined && typeof f.id === 'string' && !UUID_REGEX.test(f.id)) {
    return { query, isInvalidUuid: true, jsFilters };
  }

  for (const [key, val] of Object.entries(f)) {
    if (key === '$or' && Array.isArray(val)) {
      const orClauses = [];
      for (const condition of val) {
        for (const [cKey, cVal] of Object.entries(condition)) {
          const col = toTableColumn(tableName, cKey);
          if (cVal && typeof cVal === 'object' && cVal.$regex) {
            const cleaned = String(cVal.$regex).replace(/\\/g, '');
            orClauses.push(`${col}.ilike.%${cleaned}%`);
          } else if (cVal !== undefined) {
            orClauses.push(`${col}.eq.${cVal}`);
          }
        }
      }
      if (orClauses.length) {
        query = query.or(orClauses.join(','));
      }
      continue;
    }

    const col = toTableColumn(tableName, key);

    if (val === null || val === undefined) {
      query = query.is(col, null);
    } else if (typeof val === 'object' && !(val instanceof Date)) {
      if (val.$regex) {
        const cleaned = String(val.$regex).replace(/\\/g, '');
        query = query.ilike(col, `%${cleaned}%`);
      }
      if (val.$gte !== undefined) query = query.gte(col, val.$gte instanceof Date ? val.$gte.toISOString() : val.$gte);
      if (val.$lte !== undefined) query = query.lte(col, val.$lte instanceof Date ? val.$lte.toISOString() : val.$lte);
      if (val.$gt !== undefined) query = query.gt(col, val.$gt instanceof Date ? val.$gt.toISOString() : val.$gt);
      if (val.$lt !== undefined) query = query.lt(col, val.$lt instanceof Date ? val.$lt.toISOString() : val.$lt);
      if (val.$in && Array.isArray(val.$in)) query = query.in(col, val.$in);
      if (val.$nin && Array.isArray(val.$nin)) query = query.not(col, 'in', `(${val.$nin.join(',')})`);
      if (val.$ne !== undefined) query = query.neq(col, val.$ne);
    } else {
      query = query.eq(col, val instanceof Date ? val.toISOString() : val);
    }
  }

  return { query, isInvalidUuid: false, jsFilters };
}

// ── Query Builder ────────────────────────────────────────────────────────────
class SupabaseQueryBuilder {
  constructor(modelClass, filters = {}, isSingle = false) {
    this.modelClass = modelClass;
    this.filters = { ...filters };
    this.isSingle = isSingle;
    this.selectFields = null;
    this.populates = [];
    this.sortOptions = null;
    this.skipCount = 0;
    this.limitCount = null;
    this.isLean = false;
  }

  select(fields) {
    this.selectFields = fields;
    return this;
  }

  populate(path, select = null) {
    this.populates.push({ path, select });
    return this;
  }

  sort(sortObj) {
    this.sortOptions = sortObj;
    return this;
  }

  skip(n) {
    this.skipCount = Math.max(0, Number(n) || 0);
    return this;
  }

  limit(n) {
    this.limitCount = Math.max(0, Number(n) || 0);
    return this;
  }

  lean() {
    this.isLean = true;
    return this;
  }

  async execute() {
    let baseQuery = supabase.from(this.modelClass.tableName).select('*', { count: 'exact' });

    const { query: filteredQuery, isInvalidUuid, jsFilters } = applyFiltersToQuery(
      baseQuery,
      this.filters,
      this.modelClass.tableName
    );

    // If an invalid UUID was searched on primary key (e.g. /billing/invoices), return empty immediately
    if (isInvalidUuid) {
      return this.isSingle ? null : [];
    }

    let query = filteredQuery;

    // Apply sorting
    if (this.sortOptions) {
      if (typeof this.sortOptions === 'object') {
        for (const [sKey, order] of Object.entries(this.sortOptions)) {
          const col = toTableColumn(this.modelClass.tableName, sKey);
          const ascending = order === 1 || order === 'asc' || order === 'ascending';
          query = query.order(col, { ascending });
        }
      }
    } else {
      query = query.order('created_at', { ascending: false, nullsFirst: false });
    }

    // Apply pagination in SQL only if there are no jsFilters
    const hasJsFilters = Object.keys(jsFilters).length > 0;
    if (!hasJsFilters) {
      if (this.isSingle) {
        query = query.limit(1);
      } else {
        if (this.limitCount !== null) {
          const from = this.skipCount;
          const to = from + this.limitCount - 1;
          query = query.range(from, to);
        } else if (this.skipCount > 0) {
          query = query.range(this.skipCount, this.skipCount + 9999);
        }
      }
    }

    const { data, error } = await query;
    if (error) {
      // Graceful handling for Postgres 22P02 (invalid input syntax for type uuid)
      if (error.code === '22P02') {
        return this.isSingle ? null : [];
      }
      throw new Error(`[Supabase ${this.modelClass.tableName}] ${error.message} (${error.code})`);
    }

    if (!data) return this.isSingle ? null : [];

    let results = data.map(item => mapKeysToCamel(item, this.modelClass.tableName));

    // Apply in-memory jsFilters if any
    if (hasJsFilters) {
      results = results.filter(row => matchesJsFilter(row, jsFilters));
      if (this.skipCount > 0) {
        results = results.slice(this.skipCount);
      }
      if (this.limitCount !== null) {
        results = results.slice(0, this.limitCount);
      }
      if (this.isSingle) {
        results = results.slice(0, 1);
      }
    }

    // Apply field projection if requested
    if (this.selectFields && typeof this.selectFields === 'string') {
      const parts = this.selectFields.trim().split(/\s+/);
      const exclusions = parts.filter(p => p.startsWith('-')).map(p => p.slice(1));
      const inclusions = parts.filter(p => !p.startsWith('-') && !p.startsWith('+'));
      if (exclusions.length) {
        results = results.map(row => {
          const copy = { ...row };
          exclusions.forEach(k => delete copy[k]);
          return copy;
        });
      } else if (inclusions.length) {
        const incSet = new Set(['id', '_id', ...inclusions]);
        results = results.map(row => {
          const copy = {};
          for (const key of incSet) {
            if (row[key] !== undefined) copy[key] = row[key];
          }
          return copy;
        });
      }
    }

    // Apply populates
    if (this.populates.length) {
      for (const pop of this.populates) {
        await this.modelClass.applyPopulate(results, pop.path, pop.select);
      }
    }

    if (this.isSingle) {
      if (!results.length) return null;
      return this.isLean ? results[0] : new this.modelClass(results[0], true);
    }

    return this.isLean
      ? results
      : results.map(row => new this.modelClass(row, true));
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }
}

// ── Base Supabase Model ──────────────────────────────────────────────────────
class SupabaseModel {
  static tableName = '';

  constructor(data = {}, isExisting = false) {
    Object.assign(this, data);
    if (!this.id && this._id) {
      this.id = this._id;
    }
    if (this.id && !this._id) {
      this._id = this.id;
    }
    this._isExisting = isExisting;
    this._modifiedPaths = new Set();
  }

  isModified(path) {
    if (!this._isExisting) return true;
    return this._modifiedPaths.has(path);
  }

  markModified(path) {
    this._modifiedPaths.add(path);
  }

  toJSON() {
    return this.toObject();
  }

  toObject() {
    const copy = { ...this };
    delete copy._isExisting;
    delete copy._modifiedPaths;
    return copy;
  }

  // Pre-save hook override in subclasses if needed
  async _preSave() {}

  async save() {
    await this._preSave();
    const dataToSave = mapKeysToSnake(this.toObject(), this.constructor.tableName);
    delete dataToSave._is_existing;
    delete dataToSave._modified_paths;
    dataToSave.updated_at = new Date().toISOString();

    if (this._isExisting && this.id) {
      const { data, error } = await supabase
        .from(this.constructor.tableName)
        .update(dataToSave)
        .eq('id', this.id)
        .select()
        .single();
      if (error) throw new Error(`[Supabase update error: ${this.constructor.tableName}] ${error.message}`);
      Object.assign(this, mapKeysToCamel(data, this.constructor.tableName));
      this._isExisting = true;
      this._modifiedPaths.clear();
      return this;
    } else {
      if (!dataToSave.id) {
        dataToSave.id = crypto.randomUUID();
      }
      dataToSave.created_at = new Date().toISOString();
      const { data, error } = await supabase
        .from(this.constructor.tableName)
        .insert(dataToSave)
        .select()
        .single();
      if (error) throw new Error(`[Supabase insert error: ${this.constructor.tableName}] ${error.message}`);
      Object.assign(this, mapKeysToCamel(data, this.constructor.tableName));
      this._isExisting = true;
      this._modifiedPaths.clear();
      return this;
    }
  }

  // Static CRUD methods
  static find(filter = {}) {
    return new SupabaseQueryBuilder(this, filter, false);
  }

  static findOne(filter = {}) {
    return new SupabaseQueryBuilder(this, filter, true);
  }

  static findById(id) {
    if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
      return new SupabaseQueryBuilder(this, { id: '00000000-0000-0000-0000-000000000000' }, true);
    }
    return new SupabaseQueryBuilder(this, { id: String(id) }, true);
  }

  static async countDocuments(filter = {}) {
    const { isInvalidUuid, jsFilters } = applyFiltersToQuery(
      supabase.from(this.tableName).select('*'),
      filter,
      this.tableName
    );
    if (isInvalidUuid) return 0;

    const hasJsFilters = Object.keys(jsFilters).length > 0;
    if (hasJsFilters) {
      const docs = await this.find(filter).lean();
      return docs.length;
    }

    let query = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    const { query: filteredQuery } = applyFiltersToQuery(query, filter, this.tableName);
    const { count, error } = await filteredQuery;
    if (error) throw new Error(`[Supabase count ${this.tableName}] ${error.message}`);
    return count || 0;
  }

  static async create(docOrDocs) {
    if (Array.isArray(docOrDocs)) {
      return this.insertMany(docOrDocs);
    }
    const instance = new this(docOrDocs, false);
    return await instance.save();
  }

  static async insertMany(docs) {
    const instances = docs.map(d => new this(d, false));
    const payload = [];
    for (const inst of instances) {
      await inst._preSave();
      const snake = mapKeysToSnake(inst.toObject(), this.tableName);
      delete snake._is_existing;
      delete snake._modified_paths;
      if (!snake.id) snake.id = crypto.randomUUID();
      snake.created_at = snake.created_at || new Date().toISOString();
      snake.updated_at = new Date().toISOString();
      payload.push(snake);
    }
    const { data, error } = await supabase.from(this.tableName).insert(payload).select();
    if (error) throw new Error(`[Supabase insertMany ${this.tableName}] ${error.message}`);
    return (data || []).map(row => new this(mapKeysToCamel(row, this.tableName), true));
  }

  static async deleteMany(filter = {}) {
    let query = supabase.from(this.tableName).delete();
    if (Object.keys(filter).length === 0) {
      query = query.neq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      const { query: filteredQuery, isInvalidUuid } = applyFiltersToQuery(query, filter, this.tableName);
      if (isInvalidUuid) return { acknowledged: true, deletedCount: 0 };
      query = filteredQuery;
    }
    const { error } = await query;
    if (error) throw new Error(`[Supabase deleteMany ${this.tableName}] ${error.message}`);
    return { acknowledged: true };
  }

  static async updateMany(filter = {}, update = {}) {
    const rawData = update.$set ? { ...update.$set } : { ...update };
    delete rawData.$inc;
    delete rawData.$push;
    const snakeData = mapKeysToSnake(rawData, this.tableName);
    delete snakeData.id;
    delete snakeData._id;
    snakeData.updated_at = new Date().toISOString();

    let query = supabase.from(this.tableName).update(snakeData);
    const { query: filteredQuery, isInvalidUuid } = applyFiltersToQuery(query, filter, this.tableName);
    if (isInvalidUuid) return { acknowledged: true, modifiedCount: 0 };

    const { data, error } = await filteredQuery.select();
    if (error) throw new Error(`[Supabase updateMany ${this.tableName}] ${error.message}`);
    return { acknowledged: true, modifiedCount: (data || []).length };
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) return null;

    const rawData = update.$set ? { ...update.$set } : { ...update };
    delete rawData.$inc;
    delete rawData.$push;
    const snakeData = mapKeysToSnake(rawData, this.tableName);
    delete snakeData.id;
    delete snakeData._id;
    snakeData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(this.tableName)
      .update(snakeData)
      .eq('id', String(id))
      .select()
      .single();
    if (error) return null;
    return options.lean ? mapKeysToCamel(data, this.tableName) : new this(mapKeysToCamel(data, this.tableName), true);
  }

  static async findByIdAndDelete(id) {
    if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) return null;
    const doc = await this.findById(id);
    if (!doc) return null;
    const { error } = await supabase.from(this.tableName).delete().eq('id', String(id));
    if (error) throw new Error(error.message);
    return doc;
  }

  // Populate helper: resolves referenced IDs across tables
  static async applyPopulate(results, path, select) {
    if (!results || !results.length) return;
    const User = require('./User');
    const Patient = require('./Patient');
    const Appointment = require('./Appointment');

    let targetModel = null;
    if (path === 'assignedDoctor' || path === 'doctor' || path === 'createdBy' || path === 'updatedBy' || path === 'recipient' || path === 'sender' || path.endsWith('.doctor') || path.endsWith('.recordedBy')) {
      targetModel = User;
    } else if (path === 'patient') {
      targetModel = Patient;
    } else if (path === 'appointment') {
      targetModel = Appointment;
    }

    if (!targetModel) return;

    const idSet = new Set();
    const isNestedPath = path.includes('.');
    const [parentKey, childKey] = isNestedPath ? path.split('.') : [path, null];

    for (const r of results) {
      if (isNestedPath) {
        const parentVal = r[parentKey];
        if (Array.isArray(parentVal)) {
          for (const item of parentVal) {
            if (item && item[childKey] && UUID_REGEX.test(String(item[childKey]))) {
              idSet.add(String(item[childKey]));
            }
          }
        }
      } else {
        const val = r[path];
        if (val && UUID_REGEX.test(String(val))) {
          idSet.add(String(val));
        }
      }
    }

    if (idSet.size === 0) return;

    const ids = Array.from(idSet);
    const { data: populatedData } = await supabase
      .from(targetModel.tableName)
      .select('*')
      .in('id', ids);

    if (!populatedData || !populatedData.length) return;

    const populatedMap = new Map();
    const selectFields = select ? select.split(' ') : null;

    for (const item of populatedData) {
      const camel = mapKeysToCamel(item, targetModel.tableName);
      if (selectFields && selectFields.length) {
        const projected = { _id: camel.id, id: camel.id };
        for (const f of selectFields) {
          if (camel[f] !== undefined) projected[f] = camel[f];
        }
        populatedMap.set(camel.id, projected);
      } else {
        populatedMap.set(camel.id, camel);
      }
    }

    for (const r of results) {
      if (isNestedPath) {
        const parentVal = r[parentKey];
        if (Array.isArray(parentVal)) {
          for (const item of parentVal) {
            if (item && item[childKey] && populatedMap.has(String(item[childKey]))) {
              item[childKey] = populatedMap.get(String(item[childKey]));
            }
          }
        }
      } else {
        const val = r[path];
        if (val && populatedMap.has(String(val))) {
          r[path] = populatedMap.get(String(val));
        }
      }
    }
  }

  // Aggregate: in-memory engine mimicking MongoDB pipelines for reporting/dashboard
  static async aggregate(pipeline = []) {
    const { data, error } = await supabase.from(this.tableName).select('*');
    if (error) throw new Error(`[Supabase aggregate ${this.tableName}] ${error.message}`);
    let rows = (data || []).map(r => mapKeysToCamel(r, this.tableName));

    for (const stage of pipeline) {
      if (stage.$match) {
        rows = rows.filter(row => {
          for (const [k, v] of Object.entries(stage.$match)) {
            const rowVal = evalExpr(`$${k}`, row);
            if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
              if (v.$gte !== undefined) {
                const rDate = new Date(rowVal);
                const fDate = new Date(v.$gte);
                if (isNaN(rDate.getTime()) ? rowVal < v.$gte : rDate < fDate) return false;
              }
              if (v.$lte !== undefined) {
                const rDate = new Date(rowVal);
                const fDate = new Date(v.$lte);
                if (isNaN(rDate.getTime()) ? rowVal > v.$lte : rDate > fDate) return false;
              }
              if (v.$gt !== undefined) {
                const rDate = new Date(rowVal);
                const fDate = new Date(v.$gt);
                if (isNaN(rDate.getTime()) ? rowVal <= v.$gt : rDate <= fDate) return false;
              }
              if (v.$lt !== undefined) {
                const rDate = new Date(rowVal);
                const fDate = new Date(v.$lt);
                if (isNaN(rDate.getTime()) ? rowVal >= v.$lt : rDate >= fDate) return false;
              }
              if (v.$ne !== undefined) {
                if (rowVal === v.$ne || String(rowVal) === String(v.$ne)) return false;
              }
              if (v.$in !== undefined && Array.isArray(v.$in)) {
                if (!v.$in.some(item => item === rowVal || String(item) === String(rowVal))) return false;
              }
              if (v.$nin !== undefined && Array.isArray(v.$nin)) {
                if (v.$nin.some(item => item === rowVal || String(item) === String(rowVal))) return false;
              }
              if (v.$regex) {
                const regex = new RegExp(v.$regex, v.$options || '');
                if (!regex.test(String(rowVal || ''))) return false;
              }
            } else if (v !== undefined && rowVal !== v && String(rowVal) !== String(v)) {
              return false;
            }
          }
          return true;
        });
      }

      if (stage.$lookup) {
        const { from, localField, foreignField, as } = stage.$lookup;
        const { data: targetRows } = await supabase.from(from).select('*');
        const targetCamels = (targetRows || []).map(r => mapKeysToCamel(r, from));

        for (const row of rows) {
          const lVal = localField === '_id' ? (row.id || row._id) : getNested(row, localField);
          const matches = targetCamels.filter(t => {
            const fVal = foreignField === '_id' ? (t.id || t._id) : getNested(t, foreignField);
            return String(fVal) === String(lVal);
          });
          row[as] = matches;
        }
      }

      if (stage.$unwind) {
        const unwindField = typeof stage.$unwind === 'string'
          ? (stage.$unwind.startsWith('$') ? stage.$unwind.slice(1) : stage.$unwind)
          : (stage.$unwind.path.startsWith('$') ? stage.$unwind.path.slice(1) : stage.$unwind.path);
        const preserveNull = typeof stage.$unwind === 'object' && stage.$unwind.preserveNullAndEmpty;

        const unwound = [];
        for (const r of rows) {
          const list = getNested(r, unwindField);
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list) {
              unwound.push({ ...r, [unwindField]: item });
            }
          } else if (preserveNull) {
            unwound.push({ ...r, [unwindField]: null });
          }
        }
        rows = unwound;
      }

      if (stage.$group) {
        const groupExpr = stage.$group._id;
        const groups = {};

        for (const row of rows) {
          let idVal = null;
          let keyVal = 'all';

          if (groupExpr !== null && groupExpr !== undefined) {
            idVal = evalExpr(groupExpr, row);
            keyVal = typeof idVal === 'object' ? JSON.stringify(idVal) : String(idVal);
          }

          if (!groups[keyVal]) {
            groups[keyVal] = { _id: idVal, _counts: {} };
            for (const [accKey, accOp] of Object.entries(stage.$group)) {
              if (accKey === '_id') continue;
              groups[keyVal][accKey] = 0;
              groups[keyVal]._counts[accKey] = 0;
            }
          }

          for (const [accKey, accOp] of Object.entries(stage.$group)) {
            if (accKey === '_id') continue;
            if (accOp.$sum !== undefined) {
              const addend = evalExpr(accOp.$sum, row);
              groups[keyVal][accKey] += (Number(addend) || 0);
            } else if (accOp.$avg !== undefined) {
              const val = evalExpr(accOp.$avg, row);
              if (val !== null && !isNaN(val)) {
                groups[keyVal][accKey] += Number(val);
                groups[keyVal]._counts[accKey] += 1;
              }
            } else if (accOp.$min !== undefined) {
              const val = evalExpr(accOp.$min, row);
              if (val !== null) {
                groups[keyVal][accKey] = groups[keyVal]._counts[accKey] === 0
                  ? val
                  : Math.min(groups[keyVal][accKey], val);
                groups[keyVal]._counts[accKey] += 1;
              }
            } else if (accOp.$max !== undefined) {
              const val = evalExpr(accOp.$max, row);
              if (val !== null) {
                groups[keyVal][accKey] = groups[keyVal]._counts[accKey] === 0
                  ? val
                  : Math.max(groups[keyVal][accKey], val);
                groups[keyVal]._counts[accKey] += 1;
              }
            } else if (accOp.$push !== undefined) {
              if (!Array.isArray(groups[keyVal][accKey])) groups[keyVal][accKey] = [];
              groups[keyVal][accKey].push(evalExpr(accOp.$push, row));
            }
          }
        }

        // Finalize averages and cleanup _counts
        for (const g of Object.values(groups)) {
          for (const [accKey, accOp] of Object.entries(stage.$group)) {
            if (accKey === '_id') continue;
            if (accOp.$avg !== undefined) {
              const count = g._counts[accKey];
              g[accKey] = count > 0 ? Math.round((g[accKey] / count) * 100) / 100 : 0;
            }
          }
          delete g._counts;
        }

        rows = Object.values(groups);
      }

      if (stage.$project) {
        rows = rows.map(r => {
          const out = {};
          for (const [pKey, pVal] of Object.entries(stage.$project)) {
            if (pKey === '_id' && (pVal === 0 || pVal === false)) continue;
            if (pVal === 1 || pVal === true) {
              out[pKey] = r[pKey];
            } else {
              out[pKey] = evalExpr(pVal, r);
            }
          }
          return out;
        });
      }

      if (stage.$sort) {
        const sortEntries = Object.entries(stage.$sort);
        rows.sort((a, b) => {
          for (const [sortField, sortDir] of sortEntries) {
            const valA = getNested(a, sortField) ?? 0;
            const valB = getNested(b, sortField) ?? 0;
            if (valA < valB) return sortDir === 1 ? -1 : 1;
            if (valA > valB) return sortDir === 1 ? 1 : -1;
          }
          return 0;
        });
      }

      if (stage.$skip) {
        rows = rows.slice(stage.$skip);
      }

      if (stage.$limit) {
        rows = rows.slice(0, stage.$limit);
      }
    }

    return rows;
  }
}

module.exports = SupabaseModel;
