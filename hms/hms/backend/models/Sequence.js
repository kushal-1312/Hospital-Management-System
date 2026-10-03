const mongoose = require('mongoose');

const SequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, default: 0 }
}, { versionKey: false });

/**
 * Atomically return the next number for a named sequence.
 *
 * `initialValue` lets an existing installation bootstrap the counter from its
 * current highest human-readable ID. The update pipeline and `_id` uniqueness
 * keep concurrent creates from receiving the same number.
 */
SequenceSchema.statics.next = async function (name, initialValue = 0) {
  const sequence = await this.findOneAndUpdate(
    { _id: name },
    [{
      $set: {
        value: { $add: [{ $ifNull: ['$value', initialValue] }, 1] }
      }
    }],
    { upsert: true, new: true }
  );

  return sequence.value;
};

module.exports = mongoose.models.Sequence || mongoose.model('Sequence', SequenceSchema);
