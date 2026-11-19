import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Helper function to add timeout to promises
 */
const withTimeout = (promise, timeoutMs = 15000, errorMessage = 'Operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
};

/**
 * Helper function to capture element with timeout and retry
 */
const captureElement = async (element, options = {}, retries = 2) => {
  // Check if element exists
  if (!element) {
    throw new Error('Element not found');
  }
  
  // Store original styles
  const originalDisplay = element.style.display;
  const originalVisibility = element.style.visibility;
  const originalOpacity = element.style.opacity;
  
  // Ensure element is visible for capture
  if (element.offsetParent === null) {
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.opacity = '1';
    // Wait for rendering
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const defaultOptions = {
    scale: 1.5, // Reduced scale to prevent memory issues
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
    allowTaint: true,
    removeContainer: false,
    windowWidth: element.scrollWidth || 800,
    windowHeight: element.scrollHeight || 600,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const canvas = await withTimeout(
        html2canvas(element, { ...defaultOptions, ...options }),
        15000, // Reduced timeout to 15 seconds
        `Canvas capture timed out (attempt ${attempt + 1})`
      );
      
      // Restore original styles
      element.style.display = originalDisplay;
      element.style.visibility = originalVisibility;
      element.style.opacity = originalOpacity;
      
      return canvas;
    } catch (error) {
      console.warn(`Capture attempt ${attempt + 1} failed:`, error.message);
      if (attempt === retries) {
        // On final attempt, try with even lower quality
        try {
          const canvas = await withTimeout(
            html2canvas(element, { 
              ...defaultOptions, 
              ...options,
              scale: 1,
              useCORS: false,
            }),
            10000,
            'Final capture attempt timed out'
          );
          
          // Restore original styles
          element.style.display = originalDisplay;
          element.style.visibility = originalVisibility;
          element.style.opacity = originalOpacity;
          
          return canvas;
        } catch (finalError) {
          // Restore original styles even on error
          element.style.display = originalDisplay;
          element.style.visibility = originalVisibility;
          element.style.opacity = originalOpacity;
          
          throw new Error(`Failed to capture after ${retries + 1} attempts: ${finalError.message}`);
        }
      }
    }
  }
  
  // Restore original styles if we get here
  element.style.display = originalDisplay;
  element.style.visibility = originalVisibility;
  element.style.opacity = originalOpacity;
  
  throw new Error('Failed to capture element after all retries');
};

/**
 * Export ResultsPage content to PDF including all charts as images
 */
export const exportToPDF = async (fileName = 'Financial_Report', onProgress = null) => {
  // Set a global timeout for the entire operation (2 minutes)
  const globalTimeout = setTimeout(() => {
    if (onProgress) onProgress('Operation taking longer than expected...');
  }, 120000);

  try {
    if (onProgress) onProgress('Initializing PDF...');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Helper function to add a new page if needed
    const checkPageBreak = (requiredHeight) => {
      if (yPosition + requiredHeight > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
        return true;
      }
      return false;
    };

    // Helper function to add text with word wrap
    const addText = (text, fontSize = 12, isBold = false, color = [0, 0, 0]) => {
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      pdf.setTextColor(...color);
      
      const lines = pdf.splitTextToSize(text, contentWidth);
      checkPageBreak(lines.length * fontSize * 0.35);
      
      lines.forEach((line) => {
        pdf.text(line, margin, yPosition);
        yPosition += fontSize * 0.35;
      });
      
      yPosition += 5; // Add spacing after text
    };

    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(37, 99, 235); // Blue color
    pdf.text('Financial Analysis Report', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Document: ${fileName}`, margin, yPosition);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition + 5);
    yPosition += 15;

    // Capture and add Key Metrics Cards
    if (onProgress) onProgress('Capturing key metrics...');
    // Try multiple selectors for key metrics
    let insightsSection = document.querySelector('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-5');
    if (!insightsSection) {
      // Try alternative selector
      insightsSection = document.querySelector('.grid.gap-4');
      // Find the one that contains metric cards
      const allGrids = document.querySelectorAll('.grid.gap-4');
      insightsSection = Array.from(allGrids).find(grid => {
        const cards = grid.querySelectorAll('[class*="bg-green-50"], [class*="bg-red-50"], [class*="bg-blue-50"]');
        return cards.length > 0;
      }) || insightsSection;
    }
    
    if (insightsSection && insightsSection.offsetParent !== null) {
      addText('Key Metrics', 16, true, [0, 0, 0]);
      yPosition += 2;
      
      try {
        // Ensure element is visible
        const originalDisplay = insightsSection.style.display;
        insightsSection.style.display = 'block';
        insightsSection.style.visibility = 'visible';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        const canvas = await captureElement(insightsSection, { scale: 1.5 });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        checkPageBreak(imgHeight);
        pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
        
        // Restore original display
        insightsSection.style.display = originalDisplay;
      } catch (error) {
        console.error('Error capturing insights section:', error);
        addText('Key Metrics: Unable to capture', 12, false, [150, 150, 150]);
      }
    } else {
      addText('Key Metrics: Section not found', 12, false, [150, 150, 150]);
    }

    // Capture Charts from Charts tab
    if (onProgress) onProgress('Capturing charts...');
    const chartsButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Charts') || btn.textContent?.includes('Visualizations')
    );
    if (chartsButton) {
      const isActive = chartsButton.classList.contains('text-blue-600') || chartsButton.classList.contains('border-blue-600');
      if (!isActive) {
        chartsButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for charts to render
      }

      addText('Charts & Visualizations', 16, true, [0, 0, 0]);
      yPosition += 5;

      // Find the tab content area - look for the div with p-6 that contains the active tab
      const tabContainer = document.querySelector('.bg-white.rounded-lg.shadow-sm.border.border-gray-100');
      let tabContent = null;
      if (tabContainer) {
        tabContent = tabContainer.querySelector('.p-6');
      }
      
      // Fallback: find any div with space-y-6 that contains charts
      if (!tabContent) {
        const allSpaceY6 = document.querySelectorAll('.space-y-6');
        tabContent = Array.from(allSpaceY6).find(div => {
          // Check if it contains chart-like elements (SVG, canvas, or recharts)
          return div.querySelector('svg') || div.querySelector('canvas') || div.querySelector('[class*="recharts"]');
        });
      }

      if (tabContent && tabContent.offsetParent !== null) {
        // Try to find individual chart containers
        const chartContainers = tabContent.querySelectorAll('div[class*="grid"], div[class*="space-y"]');
        let chartsFound = false;
        
        // Look for chart components - they might be in grid layouts
        const gridContainers = tabContent.querySelectorAll('.grid');
        
        if (gridContainers.length > 0) {
          for (let i = 0; i < gridContainers.length; i++) {
            const grid = gridContainers[i];
            // Check if this grid contains charts (has SVG or canvas)
            if (grid.querySelector('svg') || grid.querySelector('canvas')) {
              chartsFound = true;
              try {
                if (onProgress) onProgress(`Capturing chart group ${i + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Make sure it's visible
                grid.style.display = 'block';
                grid.style.visibility = 'visible';
                
                const canvas = await captureElement(grid, { scale: 1.2 });
                
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = contentWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                checkPageBreak(imgHeight + 10);
                pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                yPosition += imgHeight + 10;
              } catch (error) {
                console.error(`Error capturing chart group ${i + 1}:`, error);
              }
            }
          }
        }
        
        // If no individual charts found, try to capture the entire section
        if (!chartsFound) {
          try {
            if (onProgress) onProgress('Capturing charts section...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            tabContent.style.display = 'block';
            tabContent.style.visibility = 'visible';
            
            const canvas = await captureElement(tabContent, { scale: 1.0 });
            
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = contentWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            checkPageBreak(imgHeight + 10);
            pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 10;
          } catch (error) {
            console.error('Error capturing charts section:', error);
            addText('Charts: Unable to capture - ' + error.message, 10, false, [150, 150, 150]);
          }
        }
      } else {
        addText('Charts: Section not found', 12, false, [150, 150, 150]);
      }
    }

    // Capture Financial Ratios
    if (onProgress) onProgress('Capturing financial ratios...');
    const ratiosButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Financial Ratios')
    );
    if (ratiosButton) {
      const isActive = ratiosButton.classList.contains('text-blue-600') || ratiosButton.classList.contains('border-blue-600');
      if (!isActive) {
        ratiosButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Find the tab content
      const tabContainer = document.querySelector('.bg-white.rounded-lg.shadow-sm.border.border-gray-100');
      let tabContent = null;
      if (tabContainer) {
        tabContent = tabContainer.querySelector('.p-6');
      }
      
      if (tabContent && tabContent.offsetParent !== null) {
        // Look for ratios section - could be in various structures
        let ratiosSection = tabContent.querySelector('.space-y-4') || 
                           tabContent.querySelector('.space-y-6') ||
                           tabContent.querySelector('div > div');
        
        // If still not found, use the tabContent itself
        if (!ratiosSection || ratiosSection.children.length === 0) {
          ratiosSection = tabContent;
        }
        
        if (ratiosSection) {
          addText('Financial Ratios Analysis', 16, true, [0, 0, 0]);
          yPosition += 5;
          
          try {
            // Try to find individual ratio category cards
            const ratioCategories = ratiosSection.querySelectorAll('[class*="bg-white"][class*="rounded"]');
            
            if (ratioCategories.length > 0) {
              for (let i = 0; i < ratioCategories.length; i++) {
                if (onProgress) onProgress(`Capturing ratio category ${i + 1} of ${ratioCategories.length}...`);
                
                const category = ratioCategories[i];
                
                // Expand the category if collapsed
                const toggleButton = category.querySelector('button');
                if (toggleButton) {
                  const isExpanded = category.querySelector('.grid') || category.querySelector('[class*="grid"]');
                  if (!isExpanded) {
                    toggleButton.click();
                    await new Promise(resolve => setTimeout(resolve, 800));
                  }
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                category.style.display = 'block';
                category.style.visibility = 'visible';
                
                const canvas = await captureElement(category, { scale: 1.2 });
                
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = contentWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                checkPageBreak(imgHeight + 10);
                pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                yPosition += imgHeight + 10;
              }
            } else {
              // Fallback: capture entire ratios section
              ratiosSection.style.display = 'block';
              ratiosSection.style.visibility = 'visible';
              
              await new Promise(resolve => setTimeout(resolve, 500));
              const canvas = await captureElement(ratiosSection, { scale: 1.0 });
              
              const imgData = canvas.toDataURL('image/png');
              const imgWidth = contentWidth;
              const imgHeight = (canvas.height * imgWidth) / canvas.width;
              
              checkPageBreak(imgHeight + 10);
              pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 10;
            }
          } catch (error) {
            console.error('Error capturing ratios section:', error);
            addText('Financial Ratios: Unable to capture - ' + error.message, 12, false, [150, 150, 150]);
          }
        }
      } else {
        addText('Financial Ratios: Section not found', 12, false, [150, 150, 150]);
      }
    }

    // Capture Transactions Table
    if (onProgress) onProgress('Capturing transactions...');
    const transactionsButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Transactions')
    );
    if (transactionsButton) {
      const isActive = transactionsButton.classList.contains('text-blue-600') || transactionsButton.classList.contains('border-blue-600');
      if (!isActive) {
        transactionsButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Find the tab content
      const tabContainer = document.querySelector('.bg-white.rounded-lg.shadow-sm.border.border-gray-100');
      let tabContent = null;
      if (tabContainer) {
        tabContent = tabContainer.querySelector('.p-6');
      }
      
      if (tabContent && tabContent.offsetParent !== null) {
        const transactionsSection = tabContent.querySelector('.space-y-6');
        if (transactionsSection) {
          addText('Transactions & Analysis', 16, true, [0, 0, 0]);
          yPosition += 5;
          
          const sectionsToCapture = [
            { selector: '[class*="bg-gradient-to-r"][class*="from-blue-50"]', name: 'Summary' },
            { selector: 'table', name: 'Transactions Table' },
            { selector: '[class*="bg-yellow-50"]', name: 'Anomalies' },
            { selector: '[class*="bg-blue-50"]', name: 'AI Notes' },
            { selector: '[class*="bg-gradient-to-r"][class*="from-green-50"]', name: 'Balance Overview' },
          ];
          
          let sectionsCaptured = 0;
          for (const section of sectionsToCapture) {
            const element = transactionsSection.querySelector(section.selector);
            if (element && element.offsetParent !== null) {
              try {
                if (onProgress) onProgress(`Capturing ${section.name}...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                element.style.display = 'block';
                element.style.visibility = 'visible';
                
                const canvas = await captureElement(element, { scale: 1.2 });
                
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = contentWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                checkPageBreak(imgHeight + 10);
                pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                yPosition += imgHeight + 10;
                sectionsCaptured++;
              } catch (error) {
                console.error(`Error capturing ${section.name}:`, error);
              }
            }
          }
          
          // If no individual sections captured, try to capture the whole section
          if (sectionsCaptured === 0) {
            try {
              if (onProgress) onProgress('Capturing transactions section...');
              await new Promise(resolve => setTimeout(resolve, 500));
              
              transactionsSection.style.display = 'block';
              transactionsSection.style.visibility = 'visible';
              
              const canvas = await captureElement(transactionsSection, { scale: 1.0 });
              
              const imgData = canvas.toDataURL('image/png');
              const imgWidth = contentWidth;
              const imgHeight = (canvas.height * imgWidth) / canvas.width;
              
              checkPageBreak(imgHeight + 10);
              pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 10;
            } catch (error) {
              console.error('Error capturing transactions section:', error);
              addText('Transactions: Unable to capture - ' + error.message, 12, false, [150, 150, 150]);
            }
          }
        } else {
          addText('Transactions: Section not found', 12, false, [150, 150, 150]);
        }
      } else {
        addText('Transactions: Tab content not found', 12, false, [150, 150, 150]);
      }
    }

    // Save the PDF
    if (onProgress) onProgress('Finalizing PDF...');
    const sanitizedFileName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    pdf.save(`${sanitizedFileName}_report_${new Date().getTime()}.pdf`);
    
    if (onProgress) onProgress('PDF generated successfully!');
    clearTimeout(globalTimeout);
    return true;
  } catch (error) {
    clearTimeout(globalTimeout);
    console.error('Error generating PDF:', error);
    
    // Use showToast if provided, otherwise fallback to console.error
    const errorMsg = error.message || 'Unknown error occurred';
    const finalMsg = `Failed to generate PDF: ${errorMsg}. Please try again or refresh the page.`;
    
    if (typeof arguments[2] === 'function') {
      arguments[2](finalMsg, 'error');
    } else {
      console.error(finalMsg);
    }
    return false;
  }
};


