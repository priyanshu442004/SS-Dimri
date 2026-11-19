import React from 'react';
import SohnaExcelNotesView from './SohnaExcelNotesView';
import plData from '../data/sohnaPlNotes.json';

const SohnaStaticPLNotes = ({ onBack, scrollToNote }) => {
  return (
    <SohnaExcelNotesView 
      data={plData} 
      title="Detailed Profit & Loss Notes" 
      onBack={onBack} 
      scrollToNote={scrollToNote} 
    />
  );
};

export default SohnaStaticPLNotes;
