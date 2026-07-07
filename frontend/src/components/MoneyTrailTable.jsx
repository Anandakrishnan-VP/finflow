import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function MoneyTrailTable({ caseId }) {
  const [trail, setTrail] = useState([]);
  const [selectedCreditId, setSelectedCreditId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    apiClient.get(`/cases/${caseId}/money-trail`).then((r) => {
      setTrail(r.data);
    });
  }, [caseId]);

  // Group and sort credits chronologically
  const credits = useMemo(() => {
    const map = new Map();
    trail.forEach((t) => {
      const cid = t.credit_txn_id;
      if (!cid) return;
      if (!map.has(cid)) {
        map.set(cid, {
          credit_txn_id: cid,
          credit_date: t.credit_date,
          credit_narration: t.credit_narration,
          amount: 0,
          debits: [],
        });
      }
      const item = map.get(cid);
      item.amount += Number(t.amount);
      item.debits.push(t);
    });

    // Sort credit transactions by date (oldest first)
    const list = Array.from(map.values()).sort(
      (a, b) => new Date(a.credit_date) - new Date(b.credit_date)
    );

    // Sort debits inside each credit by date (oldest first)
    list.forEach((c) => {
      c.debits.sort((a, b) => new Date(a.debit_date) - new Date(b.debit_date));
    });

    return list;
  }, [trail]);

  // Set initial selected credit
  useEffect(() => {
    if (credits.length > 0 && !selectedCreditId) {
      setSelectedCreditId(credits[0].credit_txn_id);
    }
  }, [credits, selectedCreditId]);

  // Filter credits based on search query
  const filteredCredits = useMemo(() => {
    return credits.filter(
      (c) =>
        c.credit_narration?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.amount.toString().includes(searchQuery)
    );
  }, [credits, searchQuery]);

  // Retrieve active credit & construct ledger with running balance
  const activeCredit = useMemo(() => {
    const credit = credits.find((c) => c.credit_txn_id === selectedCreditId);
    if (!credit) return null;

    let balance = credit.amount;
    const ledgerRows = credit.debits.map((d) => {
      const remaining = balance - Number(d.amount);
      const row = {
        ...d,
        running_balance: remaining,
      };
      balance = remaining;
      return row;
    });

    return {
      ...credit,
      ledger: ledgerRows,
    };
  }, [credits, selectedCreditId]);

  // Export Isolated Ledger PDF Report
  const handleExportPDF = (credit) => {
    if (!credit) return;
    const doc = new jsPDF('p', 'pt', 'a4');

    // Confidentiality Flag
    doc.setFontSize(7);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(179, 38, 30); // Alert red
    doc.text('CONFIDENTIAL // LAW ENFORCEMENT SENSITIVE', 380, 35);

    // Branding & Header
    doc.setFontSize(16);
    doc.setTextColor(31, 77, 58); // Pine green brand color
    doc.text('FinFlow Forensic Banking Analytics', 40, 52);

    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(33, 31, 22);
    doc.text('SOURCE OF FUNDS TRACING LEDGER', 40, 68);

    doc.setFontSize(8.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(110, 110, 110);
    doc.text(`Case Reference: ID-${caseId.slice(0,8).toUpperCase()}`, 40, 85);
    doc.text(`Deposit Node Ref: ${credit.credit_txn_id}`, 40, 96);
    doc.text(`Report Timestamp: ${new Date().toLocaleString()}`, 40, 107);

    // Credit Node Information Box
    doc.setFillColor(242, 245, 242);
    doc.rect(40, 120, 515, 60, 'F');
    doc.setTextColor(33, 33, 33);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('TARGET DEPOSIT RECORD (INCOMING CREDIT):', 50, 137);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Credit Date: ${new Date(credit.credit_date).toLocaleDateString()}`, 50, 152);
    doc.text(`Narration: ${credit.credit_narration}`, 50, 167);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Amount: INR ${credit.amount.toLocaleString('en-IN')}`, 390, 155);

    // Build Table Rows using INR instead of the unicode rupee character to fix font rendering failures
    const tableRows = credit.ledger.map((d) => {
      return [
        new Date(d.debit_date).toLocaleDateString(),
        d.debit_narration,
        d.counterparty_account || '—',
        `${d.days_held}d`,
        `INR ${Number(d.amount).toLocaleString('en-IN')}`,
        `INR ${d.running_balance.toLocaleString('en-IN')}`,
      ];
    });

    // Generate Table
    autoTable(doc, {
      startY: 195,
      head: [['Debit Date', 'Debit Narration', 'To Account', 'Days Held', 'Amount Spent', 'Running Balance']],
      body: tableRows,
      headStyles: { 
        fillColor: [31, 77, 58], 
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8.5
      },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      alternateRowStyles: { fillColor: [247, 249, 247] },
      margin: { left: 40, right: 40 },
    });

    // Sign-Off section (placed at bottom of page)
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.setDrawColor(200, 200, 200);
    doc.line(40, pageHeight - 90, 555, pageHeight - 90);

    doc.setFont('Helvetica', 'bold');
    doc.text('INVESTIGATION AGENCY SIGN-OFF:', 40, pageHeight - 75);
    doc.setFont('Helvetica', 'normal');
    doc.text('Audited By: __________________________', 40, pageHeight - 55);
    doc.text('Signature: ___________________________', 40, pageHeight - 35);
    doc.text('Date: ________________________', 380, pageHeight - 35);

    doc.save(`Source_of_Funds_${credit.credit_txn_id.slice(0, 8).toUpperCase()}.pdf`);
  };

  if (trail.length === 0) {
    return (
      <div className="bg-surface-raised border border-border-hairline rounded-lg p-8 text-center text-ink-muted">
        No money trail data — upload statements to execute FIFO tracking.
      </div>
    );
  }

  return (
    <div className="flex gap-4 flex-col lg:flex-row min-h-[580px]">
      {/* Left panel - credits selector */}
      <div className="w-full lg:w-80 bg-surface-raised border border-border-hairline rounded-xl p-3.5 shadow-sm flex flex-col">
        <div className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-2.5">
          Select Source Deposit
        </div>
        <input
          placeholder="Filter credits..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-xs bg-surface-sunken text-ink-primary border border-border rounded px-2.5 py-1.5 w-full focus:outline-none mb-3"
        />
        <div className="flex-1 overflow-y-auto space-y-2 max-h-[480px] pr-1">
          {filteredCredits.map((c) => (
            <div
              key={c.credit_txn_id}
              onClick={() => setSelectedCreditId(c.credit_txn_id)}
              className={`p-3 rounded-lg border text-xs cursor-pointer transition-all duration-150 ${
                selectedCreditId === c.credit_txn_id
                  ? 'bg-accent-subtle border-accent/40 shadow-sm'
                  : 'bg-surface-sunken/40 border-border hover:bg-surface-sunken/80'
              }`}
            >
              <div className="flex justify-between font-bold text-ink-primary">
                <span>{new Date(c.credit_date).toLocaleDateString()}</span>
                <span className="text-accent">₹{c.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="text-ink-muted truncate font-mono text-[10px] mt-1.5" title={c.credit_narration}>
                {c.credit_narration}
              </div>
            </div>
          ))}
          {filteredCredits.length === 0 && (
            <div className="text-center text-xs text-ink-muted py-6">No matching deposits found.</div>
          )}
        </div>
      </div>

      {/* Right panel - isolated downstream ledger */}
      <div className="flex-1 bg-surface-raised border border-border-hairline rounded-xl shadow-sm flex flex-col">
        {activeCredit ? (
          <>
            <div className="p-4 border-b border-border-hairline bg-surface-sunken/40 rounded-t-xl flex justify-between items-center flex-wrap gap-2">
              <div>
                <div className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                  Source Deposit: ₹{activeCredit.amount.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-ink-muted font-mono mt-1 break-all">
                  Node: {activeCredit.credit_txn_id} | {new Date(activeCredit.credit_date).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => handleExportPDF(activeCredit)}
                className="text-xs bg-accent hover:bg-accent-hover text-accent-fg font-semibold rounded px-3 py-1.5 shadow-sm transition-all"
              >
                📥 Download PDF Report
              </button>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-ink-muted bg-surface-sunken/20">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Debit Date</th>
                    <th className="px-4 py-3 font-semibold">Debit Narration</th>
                    <th className="px-4 py-3 font-semibold">To Account</th>
                    <th className="px-4 py-3 font-semibold text-center">Days Held</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount Spent</th>
                    <th className="px-4 py-3 font-semibold text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {activeCredit.ledger.map((d, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-surface-sunken/30 transition-colors odd:bg-surface-raised even:bg-surface-base/30"
                    >
                      <td className="px-4 py-3 text-ink-muted font-data">
                        {new Date(d.debit_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary font-mono break-all max-w-[200px]" title={d.debit_narration}>
                        {d.debit_narration}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-secondary">
                        {d.counterparty_account ? (
                          <Link
                            to={`/cases/${caseId}/suspects/${d.counterparty_account}`}
                            className="text-accent hover:underline hover:text-accent-hover font-semibold transition-colors"
                          >
                            {d.counterparty_account}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold font-data ${
                            d.days_held <= 3 ? 'text-risk-high' : 'text-ink-secondary'
                          }`}
                        >
                          {d.days_held}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-primary font-bold font-data">
                        ₹{Number(d.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary font-semibold font-data">
                        ₹{d.running_balance.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-ink-muted italic py-12">
            Select a source deposit from the left pane to analyze fund flows.
          </div>
        )}
      </div>
    </div>
  );
}
