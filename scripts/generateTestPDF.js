/**
 * Generate a sample PDF for testing
 * Run with: node scripts/generateTestPDF.js
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../data/slides.pdf');

function generateTestPDF() {
  console.log('📝 Generating test PDF...\n');
  
  const doc = new PDFDocument({ size: 'A4' });
  const writeStream = fs.createWriteStream(OUTPUT_PATH);
  
  doc.pipe(writeStream);
  
  // Slide 1: Introduction
  doc.fontSize(24).text('Slide 1: Introduction to Machine Learning', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Machine Learning (ML) is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.');
  doc.moveDown();
  doc.text('Key concepts covered in this course:');
  doc.list([
    'Supervised Learning',
    'Unsupervised Learning',
    'Neural Networks',
    'Deep Learning'
  ]);
  
  // Slide 2: Supervised Learning
  doc.addPage();
  doc.fontSize(24).text('Slide 2: Supervised Learning', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Supervised learning uses labeled datasets to train algorithms to classify data or predict outcomes.');
  doc.moveDown();
  doc.text('Common algorithms:');
  doc.list([
    'Linear Regression',
    'Logistic Regression',
    'Decision Trees',
    'Support Vector Machines (SVM)',
    'Random Forest'
  ]);
  doc.moveDown();
  doc.text('Applications: spam detection, image classification, price prediction.');
  
  // Slide 3: Unsupervised Learning
  doc.addPage();
  doc.fontSize(24).text('Slide 3: Unsupervised Learning', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Unsupervised learning finds hidden patterns in data without labeled responses.');
  doc.moveDown();
  doc.text('Types of unsupervised learning:');
  doc.list([
    'Clustering (K-means, Hierarchical)',
    'Dimensionality Reduction (PCA, t-SNE)',
    'Association Rules'
  ]);
  doc.moveDown();
  doc.text('Applications: customer segmentation, anomaly detection, recommendation systems.');
  
  // Slide 4: Neural Networks
  doc.addPage();
  doc.fontSize(24).text('Slide 4: Neural Networks', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Neural networks are computing systems inspired by biological neural networks in the brain.');
  doc.moveDown();
  doc.text('Architecture components:');
  doc.list([
    'Input Layer: receives initial data',
    'Hidden Layers: process and transform data',
    'Output Layer: produces final predictions',
    'Weights and Biases: adjustable parameters',
    'Activation Functions: add non-linearity'
  ]);
  
  // Slide 5: Summary
  doc.addPage();
  doc.fontSize(24).text('Slide 5: Summary and Next Steps', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('In this module, we covered the fundamentals of machine learning:');
  doc.moveDown();
  doc.list([
    'Understanding ML types: supervised vs unsupervised',
    'Key algorithms and their applications',
    'Introduction to neural network architecture'
  ]);
  doc.moveDown();
  doc.text('Next module: Deep Learning and Convolutional Neural Networks (CNNs).');
  doc.moveDown();
  doc.text('Questions? Contact: instructor@university.edu');
  
  doc.end();
  
  writeStream.on('finish', () => {
    console.log(`✅ Test PDF generated: ${OUTPUT_PATH}`);
    console.log('📊 Contains 5 slides about Machine Learning');
    console.log('\n💡 Now run: node src/services/pdfService.test.js');
  });
}

generateTestPDF();
