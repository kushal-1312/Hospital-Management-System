const { supabase } = require('../config/supabase');
const crypto = require('crypto');

// ── Utility: Case Conversions ────────────────────────────────────────────────
const toSnakeCase = str =>
  str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

const toCamelCase = str =>
  str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());

const mapKeysToSnake = obj => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k === '_id' ? 'id' : toSnakeCase(k);
    result[key] = v;
  }
  return result;
};

const mapKeysToCamel = obj => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k === 'id' ? 'id' : toCamelCase(k);
    result[key] = v;
  }
  if (result.id && !result._id) {
    result._id = result.id;
  }
  return result;
};

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
    let query = supabase.from(this.modelClass.tableName).select('*', { count: 'exact' });

    // Handle _id -> id conversion in filter
    if (this.filters._id) {
      this.filters.id = this.filters._id;
      delete this.filters._id;
    }

    // Apply filters
    for (const [key, val] of Object.entries(this.filters)) {
      if (key === '$or' && Array.isArray(val)) {
        // e.g. [{ name: { $regex: 'x', $options: 'i' } }, { patientId: ... }]
        const orClauses = [];
        for (const condition of val) {
          for (const [cKey, cVal] of Object.entries(condition)) {
            const col = toSnakeCase(cKey === '_id' ? 'id' : cKey);
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

      const col = toSnakeCase(key);

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

    // Apply sorting
    if (this.sortOptions) {
      if (typeof this.sortOptions === 'object') {
        for (const [sKey, order] of Object.entries(this.sortOptions)) {
          const col = toSnakeCase(sKey === '_id' ? 'id' : sKey);
          const ascending = order === 1 || order === 'asc' || order === 'ascending';
          query = query.order(col, { ascending });
        }
      }
    } else {
      query = query.order('created_at', { ascending: false, nullsFirst: false });
    }

    // Apply pagination
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

    const { data, error } = await query;
    if (error) {
      throw new Error(`[Supabase ${this.modelClass.tableName}] ${error.message} (${error.code})`);
    }

    if (!data) return this.isSingle ? null : [];

    let results = data.map(item => mapKeysToCamel(item));

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
    const dataToSave = mapKeysToSnake(this.toObject());
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
      Object.assign(this, mapKeysToCamel(data));
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
      Object.assign(this, mapKeysToCamel(data));
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
    if (!id) return new SupabaseQueryBuilder(this, { id: '00000000-0000-0000-0000-000000000000' }, true);
    return new SupabaseQueryBuilder(this, { id: String(id) }, true);
  }

  static async countDocuments(filter = {}) {
    let query = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filter)) {
      if (k === '_id' || k === 'id') {
        query = query.eq('id', v);
      } else if (typeof v === 'object' && v !== null) {
        const col = toSnakeCase(k);
        if (v.$gte !== undefined) query = query.gte(col, v.$gte instanceof Date ? v.$gte.toISOString() : v.$gte);
        if (v.$lte !== undefined) query = query.lte(col, v.$lte instanceof Date ? v.$lte.toISOString() : v.$lte);
      } else {
        query = query.eq(toSnakeCase(k), v);
      }
    }
    const { count, error } = await query;
    if (error) throw new Error(error.message);
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
      const snake = mapKeysToSnake(inst.toObject());
      delete snake._is_existing;
      delete snake._modified_paths;
      if (!snake.id) snake.id = crypto.randomUUID();
      snake.created_at = snake.created_at || new Date().toISOString();
      snake.updated_at = new Date().toISOString();
      payload.push(snake);
    }
    const { data, error } = await supabase.from(this.tableName).insert(payload).select();
    if (error) throw new Error(`[Supabase insertMany ${this.tableName}] ${error.message}`);
    return (data || []).map(row => new this(mapKeysToCamel(row), true));
  }

  static async deleteMany(filter = {}) {
    let query = supabase.from(this.tableName).delete();
    if (Object.keys(filter).length === 0) {
      query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    } else {
      for (const [k, v] of Object.entries(filter)) {
        const col = k === '_id' || k === 'id' ? 'id' : toSnakeCase(k);
        query = query.eq(col, v);
      }
    }
    const { error } = await query;
    if (error) throw new Error(`[Supabase deleteMany ${this.tableName}] ${error.message}`);
    return { acknowledged: true };
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const rawData = update.$set ? { ...update.$set } : { ...update };
    delete rawData.$inc;
    delete rawData.$push;
    const snakeData = mapKeysToSnake(rawData);
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
    return options.lean ? mapKeysToCamel(data) : new this(mapKeysToCamel(data), true);
  }

  static async findByIdAndDelete(id) {
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

    let targetModel = null;
    if (path === 'assignedDoctor' || path === 'doctor' || path === 'createdBy' || path === 'updatedBy' || path === 'recipient' || path === 'sender' || path.endsWith('.doctor')) {
      targetModel = User;
    } else if (path === 'patient') {
      targetModel = Patient;
    }

    if (!targetModel) return;

    for (const item of results) {
      const refId = item[path];
      if (refId && typeof refId === 'string') {
        const related = await targetModel.findById(refId).lean();
        if (related) {
          if (select && typeof select === 'string') {
            const fields = select.split(/\s+/);
            const filtered = { id: related.id, _id: related._id };
            fields.forEach(f => { if (related[f] !== undefined) filtered[f] = related[f]; });
            item[path] = filtered;
          } else {
            item[path] = related;
          }
        }
      }
    }
  }

  // In-memory aggregator for grouping/metrics
  static async aggregate(pipeline = []) {
    let rows = await this.find({}).lean();

    for (const stage of pipeline) {
      if (stage.$match) {
        rows = rows.filter(row => {
          for (const [k, v] of Object.entries(stage.$match)) {
            if (v && typeof v === 'object' && v.$gte) {
              if (new Date(row[k]) < new Date(v.$gte)) return false;
            } else if (v && typeof v === 'object' && v.$lte) {
              if (new Date(row[k]) > new Date(v.$lte)) return false;
            } else if (v !== undefined && row[k] !== v && String(row[k]) !== String(v)) {
              return false;
            }
          }
          return true;
        });
      }

      if (stage.$group) {
        const groupKey = stage.$group._id;
        const groups = {};

        for (const row of rows) {
          let keyVal;
          if (groupKey === null) {
            keyVal = 'all';
          } else if (typeof groupKey === 'string' && groupKey.startsWith('$')) {
            keyVal = row[groupKey.slice(1)] ?? 'unknown';
          } else if (typeof groupKey === 'object') {
            keyVal = JSON.stringify(groupKey);
          } else {
            keyVal = String(groupKey);
          }

          if (!groups[keyVal]) {
            groups[keyVal] = { _id: groupKey === null ? null : row[groupKey.slice(1)] || keyVal };
            for (const [accKey, accOp] of Object.entries(stage.$group)) {
              if (accKey === '_id') continue;
              groups[keyVal][accKey] = 0;
            }
          }

          for (const [accKey, accOp] of Object.entries(stage.$group)) {
            if (accKey === '_id') continue;
            if (accOp.$sum !== undefined) {
              if (typeof accOp.$sum === 'number') {
                groups[keyVal][accKey] += accOp.$sum;
              } else if (typeof accOp.$sum === 'string' && accOp.$sum.startsWith('$')) {
                const val = Number(row[accOp.$sum.slice(1)]) || 0;
                groups[keyVal][accKey] += val;
              } else if (accOp.$sum.$cond) {
                const [condField, trueVal, falseVal] = accOp.$sum.$cond;
                const fieldName = condField.startsWith('$') ? condField.slice(1) : condField;
                groups[keyVal][accKey] += row[fieldName] ? trueVal : falseVal;
              }
            }
          }
        }
        rows = Object.values(groups);
      }

      if (stage.$sort) {
        const [sortField, sortDir] = Object.entries(stage.$sort)[0];
        rows.sort((a, b) => {
          const valA = a[sortField] || 0;
          const valB = b[sortField] || 0;
          return sortDir === 1 ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
      }

      if (stage.$limit) {
        rows = rows.slice(0, stage.$limit);
      }
    }

    return rows;
  }
}

module.exports = SupabaseModel;
