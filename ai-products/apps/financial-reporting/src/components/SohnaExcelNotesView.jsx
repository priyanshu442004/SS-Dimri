import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { exportSohnaNotesToExcel } from '../utils/sohnaExportUtils';

const SohnaExcelNotesView = ({ data, title, onBack, scrollToNote }) => {
  const containerRef = useRef(null);

  // Auto-scroll to specific note
  useEffect(() => {
    if (scrollToNote && containerRef.current) {
      // Find the row that contains text matching "Note X" or similar
      // In JS, querySelector targeting IDs that might be dynamic
      const element = document.getElementById(`note-${scrollToNote.toLowerCase()}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // briefly highlight the row
        element.classList.add('bg-indigo-100', 'transition-colors', 'duration-500');
        setTimeout(() => element.classList.remove('bg-indigo-100'), 3000);
      }
    }
  }, [scrollToNote]);

  // Identify anchor tags for a specific note. The Excel row might contain "Note 6(b)" or "Note 6" or "6  Financial assets"
  const getRowId = (row) => {
    if (!row || !row.length) return null;
    const firstCell = String(row[0] || row[1] || '').trim();
    if (!firstCell) return null;
    
    // Attempt to match patterns like "Note 6", "Note 6(a)", "6. ", "6 "
    const match = firstCell.match(/^(?:Note\s+)?([0-a-zA-Z()]+)/i);
    if (match && match[1]) {
      // Return a clean id like "6a" for "Note 6(a)"
      const cleanId = match[1].replace(/[^0-9a-z]/gi, '').toLowerCase();
      // Only return if it resembles a valid note number (digit-led)
      if (/^\d+[a-z]?$/.test(cleanId)) {
        return `note-${cleanId}`;
      }
    }
    return null;
  };

  const formatNumber = (val) => {
    if (typeof val === 'number') {
      if (val === 0) return '-';
      if (val < 0) return `(${(Math.abs(val)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-12 font-sans bg-white min-h-screen">
      <div className="flex justify-between items-start mb-8 sticky top-0 bg-white/90 backdrop-blur pb-4 z-10 border-b border-gray-100">
        <button onClick={onBack} className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors font-semibold group bg-gray-50 px-4 py-2 rounded-xl">
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Report
        </button>
        <div className="text-center flex-1 pr-4">
          <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">XYZ SOHNA PROJECTS LIMITED</h1>
          <p className="text-lg font-bold text-gray-800 mt-2 leading-tight text-indigo-700">{title}</p>
        </div>
        <button 
          onClick={() => exportSohnaNotesToExcel(data, title, `XYZ_Sohna_Notes_${title.replace(/\s+/g, '_')}.xlsx`)} 
          className="flex items-center text-white bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold group px-6 py-2 rounded-xl shadow-lg active:scale-95"
        >
          <Download className="w-5 h-5 mr-2" /> Export Notes
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-xl shadow-gray-200/50" ref={containerRef}>
        <table className="w-full border-collapse">
          <tbody className="divide-y divide-gray-100">
            {data.map((row, rowIndex) => {
              // Ensure row has at least some content
              if (!row || row.filter(cell => cell !== null && cell !== '').length === 0) {
                return (
                  <tr key={rowIndex} className="border-0">
                    <td colSpan={10} className="py-2"></td>
                  </tr>
                );
              }

              const isHeading = row.filter(cell => typeof cell === 'string' && cell.trim() !== '').length === 1 && typeof row[1] === 'string' && row[1].length > 10;
              const potentialId = getRowId(row);
              
              // We style the row based on content to make it look premium
              return (
                <tr 
                  key={rowIndex} 
                  id={potentialId || undefined}
                  className={`hover:bg-gray-50/50 transition-colors ${isHeading ? 'bg-gray-50' : ''}`}
                >
                  {row.map((cell, colIndex) => {
                    const isNum = typeof cell === 'number';
                    if (isHeading && colIndex === 1) {
                      return (
                        <td key={colIndex} colSpan={10} className="py-3 px-6 text-[13px] font-bold text-gray-800 whitespace-pre-wrap">
                          {cell}
                        </td>
                      );
                    } else if (isHeading && colIndex !== 1) {
                      return null; // Merge cells logic slightly simplified
                    }

                    return (
                      <td 
                        key={colIndex} 
                        className={`py-2 px-4 text-[12px] border-l first:border-l-0 border-gray-100 whitespace-pre-wrap ${isNum ? 'text-right font-mono text-gray-700' : 'text-left text-gray-600'} ${cell === 'Total' ? 'font-bold text-indigo-700' : ''}`}
                      >
                        {formatNumber(cell)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-12 mb-12 text-[10px] text-gray-300 italic text-center uppercase tracking-widest font-black">
        End of Document - Displaying Static Extracted Values
      </div>
    </div>
  );
};

export default SohnaExcelNotesView;
