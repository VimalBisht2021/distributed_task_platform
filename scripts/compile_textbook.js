const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '../docs/textbook');
const outputFile = path.join(__dirname, '../DISTRIBUTED_SYSTEMS_TEXTBOOK.md');

const chapters = [
  'chapter_0.md',
  'chapter_1.md',
  'chapter_2.md',
  'chapter_3.md',
  'chapter_4.md',
  'chapter_5.md',
  'chapter_6.md',
  'chapter_7.md',
  'chapter_8.md',
  'chapter_9.md',
  'chapter_10.md',
  'chapter_11.md',
  'chapter_12.md',
  'chapter_13.md',
  'chapter_14.md',
  'chapter_15.md',
  'chapter_16.md',
  'chapter_17.md',
  'appendix.md'
];

let finalContent = `# The Definitive Guide to Distributed Systems\n\n`;
finalContent += `*A practical textbook built from first principles, analyzing the architecture of a custom Distributed Task Platform.*\n\n---\n\n`;

for (const file of chapters) {
  const filePath = path.join(docsDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`Reading ${file}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    finalContent += content + '\n\n<div style="page-break-after: always;"></div>\n\n';
  } else {
    console.error(`Warning: ${file} not found!`);
  }
}

fs.writeFileSync(outputFile, finalContent);
console.log(`\n✅ Successfully compiled all chapters into: ${outputFile}`);
