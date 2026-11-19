import AWS from "aws-sdk";

import pool from "../config/database.js";
import { uploadToS3 } from "../config/s3.js";


// Initialize AWS Textract
const textract = new AWS.Textract({
  region: process.env.AWS_TEXTRACT_REGION || 'us-east-1'
});

/**
 * Process a document through the AI pipeline
 */
async function processDocument(documentId) {
  try {
    // Update status to processing
    await pool.query(
      `UPDATE documents 
      SET processing_status = $1, processing_started_at = $2 
      WHERE document_id = $3`,
      ['processing', new Date(), documentId]
    );

    // Get document info
    const docResult = await pool.query(
      `SELECT * FROM documents WHERE document_id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const doc = docResult.rows[0];

    // Step 1: Extract text using AWS Textract
    const extractedText = await extractText(doc.storage_path);

    // Step 2: Detect tables
    const tables = await detectTables(doc.storage_path);

    // Step 3: Extract transactions
    const transactions = await extractTransactions(extractedText, tables);

    // Step 4: Categorize transactions
    const categorizedTransactions = await categorizeTransactions(transactions);

    // Step 5: Detect anomalies
    const anomalies = await detectAnomalies(categorizedTransactions);

    // Step 6: Generate insights
    const insights = await generateInsights(categorizedTransactions, anomalies);

    // Step 7: Calculate summary statistics
    const summaryStats = calculateSummaryStats(categorizedTransactions);

    // Step 8: Generate output files
    const outputFiles = await generateOutputFiles(
      documentId,
      categorizedTransactions,
      summaryStats,
      insights
    );

    // Save results to database
    await pool.query(
      `INSERT INTO processing_results (
        result_id, document_id, extracted_data, insights,
        summary_stats, anomalies, output_files
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        require('uuid').v4(),
        documentId,
        JSON.stringify(categorizedTransactions),
        JSON.stringify(insights),
        JSON.stringify(summaryStats),
        JSON.stringify(anomalies),
        JSON.stringify(outputFiles)
      ]
    );

    // Update document status to completed
    await pool.query(
      `UPDATE documents 
      SET processing_status = $1, processing_completed_at = $2 
      WHERE document_id = $3`,
      ['completed', new Date(), documentId]
    );

    console.log(`✅ Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`❌ Error processing document ${documentId}:`, error);
    
    // Update status to failed
    await pool.query(
      `UPDATE documents 
      SET processing_status = $1, error_message = $2 
      WHERE document_id = $3`,
      ['failed', error.message, documentId]
    );
  }
}

/**
 * Extract text from document using AWS Textract
 */
async function extractText(s3Key) {
  const params = {
    Document: {
      S3Object: {
        Bucket: process.env.S3_BUCKET_NAME,
        Name: s3Key
      }
    }
  };

  try {
    const response = await textract.detectDocumentText(params).promise();
    return response.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');
  } catch (error) {
    console.error('Textract error:', error);
    // Fallback: return empty string or use alternative OCR
    return '';
  }
}

/**
 * Detect tables in document
 */
async function detectTables(s3Key) {
  const params = {
    Document: {
      S3Object: {
        Bucket: process.env.S3_BUCKET_NAME,
        Name: s3Key
      }
    }
  };

  try {
    const response = await textract.analyzeDocument({
      ...params,
      FeatureTypes: ['TABLES']
    }).promise();

    // Parse table data
    return parseTables(response.Blocks);
  } catch (error) {
    console.error('Table detection error:', error);
    return [];
  }
}

/**
 * Parse tables from Textract response
 */
function parseTables(blocks) {
  // Implementation for parsing table structures
  // This is a simplified version
  const tables = [];
  // Add table parsing logic here
  return tables;
}

/**
 * Extract transactions from text and tables
 */
function extractTransactions(text, tables) {
  // Use regex patterns and NLP to extract transactions
  const transactions = [];
  
  // Example: Extract date, description, amount patterns
  const transactionPattern = /(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([+-]?\d+[.,]?\d*)/g;
  let match;
  
  while ((match = transactionPattern.exec(text)) !== null) {
    transactions.push({
      date: match[1],
      description: match[2].trim(),
      amount: parseFloat(match[3].replace(',', '')),
      type: parseFloat(match[3]) >= 0 ? 'Credit' : 'Debit'
    });
  }

  return transactions;
}

/**
 * Categorize transactions
 */
function categorizeTransactions(transactions) {
  // Simple categorization logic
  // In production, use ML model
  const categories = {
    'Salary': ['salary', 'payroll', 'wage'],
    'Vendor Payment': ['vendor', 'supplier', 'payment'],
    'Invoice': ['invoice', 'bill', 'receipt'],
    'Transfer': ['transfer', 'transaction']
  };

  return transactions.map(transaction => {
    const desc = transaction.description.toLowerCase();
    let category = 'Other';

    for (const [cat, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        category = cat;
        break;
      }
    }

    return { ...transaction, category };
  });
}

/**
 * Detect anomalies in transactions
 */
function detectAnomalies(transactions) {
  const anomalies = [];
  
  // Simple anomaly detection
  // In production, use ML model (Isolation Forest, etc.)
  const amounts = transactions.map(t => Math.abs(t.amount));
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const stdDev = Math.sqrt(
    amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length
  );

  transactions.forEach((transaction, index) => {
    const zScore = Math.abs((Math.abs(transaction.amount) - mean) / stdDev);
    if (zScore > 3) { // 3 standard deviations
      anomalies.push({
        transaction_index: index,
        reason: 'Unusual amount',
        transaction: transaction
      });
    }
  });

  return anomalies;
}

/**
 * Generate insights from transactions
 */
function generateInsights(transactions, anomalies) {
  const insights = [];
  
  // Generate basic insights
  const totalCredits = transactions
    .filter(t => t.type === 'Credit')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalDebits = transactions
    .filter(t => t.type === 'Debit')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  insights.push(`Total credits: ₹${totalCredits.toLocaleString()}`);
  insights.push(`Total debits: ₹${totalDebits.toLocaleString()}`);
  insights.push(`Net balance: ₹${(totalCredits - totalDebits).toLocaleString()}`);

  if (anomalies.length > 0) {
    insights.push(`Detected ${anomalies.length} unusual transactions`);
  }

  return insights;
}

/**
 * Calculate summary statistics
 */
function calculateSummaryStats(transactions) {
  const credits = transactions.filter(t => t.type === 'Credit');
  const debits = transactions.filter(t => t.type === 'Debit');

  return {
    total_credits: credits.reduce((sum, t) => sum + t.amount, 0),
    total_debits: debits.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    net_balance: credits.reduce((sum, t) => sum + t.amount, 0) - 
                 debits.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    transaction_count: transactions.length,
    anomalies_count: 0 // Will be updated from anomalies array
  };
}

/**
 * Generate output files (PDF, Excel, JSON)
 */
async function generateOutputFiles(documentId, transactions, summaryStats, insights) {
  const userId = transactions[0]?.user_id || 'unknown';
  const outputFiles = {};

  // Generate JSON file
  const jsonData = {
    transactions,
    summary: summaryStats,
    insights
  };
  
  const jsonKey = `processed/${userId}/${documentId}/output.json`;
  await uploadToS3(
    { buffer: Buffer.from(JSON.stringify(jsonData, null, 2)) },
    jsonKey,
    'application/json'
  );
  outputFiles.json = jsonKey;

  // Generate Excel file (simplified - use library like exceljs in production)
  // For now, create CSV
  const csvData = generateCSV(transactions);
  const csvKey = `processed/${userId}/${documentId}/output.csv`;
  await uploadToS3(
    { buffer: Buffer.from(csvData) },
    csvKey,
    'text/csv'
  );
  outputFiles.excel = csvKey;

  // PDF generation would require a library like pdfkit
  // For now, skip PDF or use a service

  return outputFiles;
}

/**
 * Generate CSV from transactions
 */
function generateCSV(transactions) {
  const headers = 'Date,Description,Type,Amount,Category\n';
  const rows = transactions.map(t => 
    `${t.date},${t.description},${t.type},${t.amount},${t.category}`
  ).join('\n');
  return headers + rows;
}

export { processDocument };

