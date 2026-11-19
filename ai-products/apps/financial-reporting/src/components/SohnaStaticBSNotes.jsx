import React from 'react';
import SohnaExcelNotesView from './SohnaExcelNotesView';
import bsData from '../data/sohnaBsNotes.json';

const SohnaStaticBSNotes = ({ onBack, scrollToNote }) => {
  return (
    <SohnaExcelNotesView 
      data={bsData} 
      title="Detailed Balance Sheet Notes" 
      onBack={onBack} 
      scrollToNote={scrollToNote} 
    />
  );
};

export default SohnaStaticBSNotes;
