const { supabase } = require('../config/supabase');

class Sequence {
  static async next(name, initialValue = 0) {
    try {
      const { data, error } = await supabase.rpc('get_next_sequence', {
        seq_id: name,
        initial_val: initialValue
      });
      if (!error && data !== null && data !== undefined) {
        return Number(data);
      }
    } catch (_) {}

    // Fallback if RPC function is not created: table upsert
    try {
      const { data: existing } = await supabase
        .from('sequences')
        .select('value')
        .eq('id', name)
        .maybeSingle();

      const nextVal = (existing?.value !== undefined ? Number(existing.value) : initialValue) + 1;

      await supabase.from('sequences').upsert({
        id: name,
        value: nextVal,
        updated_at: new Date().toISOString()
      });

      return nextVal;
    } catch (err) {
      // Last-resort memory increment
      return (initialValue || 0) + 1;
    }
  }
}

module.exports = Sequence;
