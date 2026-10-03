import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { pharmacyAPI, patientAPI, userAPI } from '../../services/api';

export default function DispenseForm({ onClose, prefillPatient }) {
  const [patients,   setPatients]   = useState([]);
  const [doctors,    setDoctors]    = useState([]);
  const [medicines,  setMedicines]  = useState([]);
  const [patientId,  setPatientId]  = useState(prefillPatient?._id || '');
  const [prescribedById, setPrescribedById] = useState('');
  const [paymentMethod, setPaymentMethod]   = useState('cash');
  const [notes,      setNotes]      = useState('');
  const [discount,   setDiscount]   = useState(0);
  const [items,      setItems]      = useState([{ medicineId: '', quantity: 1, instructions: '' }]);
  const [loading,    setLoading]    = useState(false);
  const [medicineSearch, setMedicineSearch] = useState('');

  useEffect(() => {
    Promise.all([
      patientAPI.getAll({ limit: 200 }),
      userAPI.getDoctors(),
      pharmacyAPI.getMedicines({ limit: 200 })
    ]).then(([pr, dr, mr]) => {
      setPatients(pr.data.data);
      setDoctors(dr.data.data);
      setMedicines(mr.data.data);
    }).catch(console.error);
  }, []);

  // ── Item helpers ──────────────────────────────────────────
  const setItem   = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const addItem   = () => setItems(prev => [...prev, { medicineId: '', quantity: 1, instructions: '' }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Live total ────────────────────────────────────────────
  const subtotal = items.reduce((acc, item) => {
    const med = medicines.find(m => m._id === item.medicineId);
    return acc + ((med?.sellingPrice || 0) * (Number(item.quantity) || 0));
  }, 0);
  const totalAmount = Math.max(0, subtotal - Number(discount));

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId) return toast.error('Select a patient');
    if (items.some(it => !it.medicineId)) return toast.error('Select medicine for all items');
    if (items.some(it => Number(it.quantity) < 1)) return toast.error('All quantities must be at least 1');

    // Attach unit price from medicine catalogue
    const itemsWithPrice = items.map(it => {
      const med = medicines.find(m => m._id === it.medicineId);
      return { ...it, unitPrice: med?.sellingPrice || 0 };
    });

    setLoading(true);
    try {
      await pharmacyAPI.dispense({
        patientId, prescribedById, prescribedByName: doctors.find(d => d._id === prescribedById)?.name,
        items: itemsWithPrice, paymentMethod, notes,
        discount: Number(discount)
      });
      toast.success('Medicines dispensed successfully');
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Dispensing failed');
    } finally { setLoading(false); }
  };

  const filteredMeds = medicineSearch
    ? medicines.filter(m => m.name.toLowerCase().includes(medicineSearch.toLowerCase()))
    : medicines;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <h3 className="modal-title">💊 Dispense Medicines</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Patient + Doctor row */}
            <div className="form-row" style={{ marginBottom: 20 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Patient *</label>
                <select className="form-control" value={patientId} onChange={e => setPatientId(e.target.value)} required>
                  <option value="">Select patient</option>
                  {patients.map(p => (
                    <option key={p._id} value={p._id}>{p.name} — {p.patientId}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prescribed By (Doctor)</label>
                <select className="form-control" value={prescribedById} onChange={e => setPrescribedById(e.target.value)}>
                  <option value="">Select doctor (optional)</option>
                  {doctors.map(d => (
                    <option key={d._id} value={d._id}>{d.name} — {d.specialization}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Medicine search */}
            <div className="form-group" style={{ marginBottom: 8 }}>
              <input
                className="form-control"
                placeholder="🔍 Search medicines..."
                value={medicineSearch}
                onChange={e => setMedicineSearch(e.target.value)}
                style={{ maxWidth: 320 }}
              />
            </div>

            {/* Medicine items */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ margin: 0 }}>Medicines *</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Row</button>
              </div>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 80px 120px 2fr 32px', gap: 8, padding: '6px 8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
                {['Medicine', 'Qty', 'Unit Price', 'Instructions', ''].map(h => (
                  <span key={h} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
                ))}
              </div>

              {items.map((item, idx) => {
                const selectedMed = medicines.find(m => m._id === item.medicineId);
                const outOfStock  = selectedMed && selectedMed.currentStock === 0;
                const overStock   = selectedMed && Number(item.quantity) > selectedMed.currentStock;

                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 80px 120px 2fr 32px', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div>
                      <select
                        className={`form-control ${(outOfStock || overStock) ? 'error' : ''}`}
                        value={item.medicineId}
                        onChange={e => setItem(idx, 'medicineId', e.target.value)}
                        required
                      >
                        <option value="">Select medicine</option>
                        {filteredMeds.map(m => (
                          <option key={m._id} value={m._id} disabled={m.currentStock === 0}>
                            {m.name}{m.strength ? ` (${m.strength})` : ''} — {m.currentStock} {m.unit} left
                          </option>
                        ))}
                      </select>
                      {outOfStock && <p className="form-error">Out of stock</p>}
                      {overStock && !outOfStock && (
                        <p className="form-error">Only {selectedMed.currentStock} available</p>
                      )}
                    </div>
                    <input
                      type="number" className="form-control" min="1"
                      max={selectedMed?.currentStock || 9999}
                      value={item.quantity}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                    />
                    <div style={{ padding: '10px 0', fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary)' }}>
                      {selectedMed ? `₹${((selectedMed.sellingPrice || 0) * (Number(item.quantity) || 0)).toLocaleString('en-IN')}` : '—'}
                    </div>
                    <input
                      className="form-control"
                      placeholder="e.g. 1 tab twice daily"
                      value={item.instructions}
                      onChange={e => setItem(idx, 'instructions', e.target.value)}
                    />
                    <button
                      type="button" onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      style={{ width: 32, height: 38, border: 'none', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '1rem' }}
                    >×</button>
                  </div>
                );
              })}
            </div>

            {/* Bottom row: payment + notes + totals */}
            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Payment Method</label>
                <select className="form-control" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  {['cash','card','upi','insurance','bill_to_invoice'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Discount (₹)</label>
                <input type="number" className="form-control" min="0" value={discount}
                  onChange={e => setDiscount(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={notes}
                onChange={e => setNotes(e.target.value)} placeholder="Any special instructions..." />
            </div>

            {/* Totals summary */}
            <div style={{ background: 'var(--primary-50)', border: '1px solid rgba(10,110,94,0.2)', borderRadius: 'var(--radius)', padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center' }}>
              {[
                ['Subtotal',    `₹${subtotal.toLocaleString('en-IN')}`],
                ['Discount',    `₹${Number(discount || 0).toLocaleString('en-IN')}`],
                ['Total Amount', `₹${totalAmount.toLocaleString('en-IN')}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-dark)', marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button
              type="submit" className="btn btn-primary" disabled={loading || items.some(it => !it.medicineId)}
            >
              {loading ? 'Dispensing...' : '💊 Confirm Dispense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
