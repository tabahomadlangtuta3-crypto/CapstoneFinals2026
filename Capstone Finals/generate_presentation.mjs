import PptxGenJS from 'pptxgenjs';

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Capstone Team';
pptx.company = 'MaternaCare';
pptx.subject = 'MaternaCare System Presentation';
pptx.title = 'MaternaCare System Presentation';

const dark = '0F172A';
const green = '1F5F5B';
const blue = '2D4F73';
const gold = 'C7A66B';

const addFooter = (slide, pageNumber) => {
  slide.addText('MaternaCare | Capstone System Presentation', {
    x: 0.4,
    y: 6.75,
    w: 5.5,
    h: 0.2,
    fontFace: 'Aptos',
    fontSize: 9,
    color: '6B7280',
    bold: true,
  });
  slide.addText(`${pageNumber}`, {
    x: 12.2,
    y: 6.75,
    w: 0.7,
    h: 0.2,
    fontFace: 'Aptos',
    fontSize: 9,
    color: '6B7280',
    bold: true,
    align: 'right',
  });
};

const titleSlide = pptx.addSlide();
titleSlide.background = { color: 'F8FAF9' };
titleSlide.addText('MaternaCare', {
  x: 0.7,
  y: 1.1,
  w: 8.5,
  h: 0.9,
  fontFace: 'Aptos',
  fontSize: 28,
  bold: true,
  color: dark,
  margin: 0,
});
titleSlide.addText('Maternal Health Management and Security System', {
  x: 0.85,
  y: 2.1,
  w: 8.0,
  h: 0.7,
  fontFace: 'Aptos',
  fontSize: 18,
  color: green,
  bold: true,
});
titleSlide.addText('Capstone Presentation', {
  x: 0.85,
  y: 2.9,
  w: 5.2,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 13,
  color: '64748B',
});
titleSlide.addText([
  { text: 'System purpose: ', bold: true, color: dark },
  { text: 'digitize maternal records, strengthen barangay-level care coordination, and send reminder notifications to reduce missed appointments.', color: dark },
], {
  x: 0.9,
  y: 4.0,
  w: 8.3,
  h: 1.1,
  fontSize: 18,
  color: dark,
  margin: 0.08,
  valign: 'middle',
  align: 'left',
  breakLine: true,
});
titleSlide.addText('Prepared by: Capstone Project Team', {
  x: 0.9,
  y: 5.6,
  w: 5.5,
  h: 0.35,
  fontFace: 'Aptos',
  fontSize: 12,
  color: '475569',
  italic: true,
});
titleSlide.addImage({ path: 'assets/maternacare-icon.svg', x: 10.5, y: 1.3, w: 2.2, h: 2.2 });
addFooter(titleSlide, 1);

const toc = pptx.addSlide();
toc.background = { color: 'F7F9F8' };
toc.addText('Table of Contents', {
  x: 0.7,
  y: 0.5,
  w: 9.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});

const tocRows = [
  ['CHAPTER 1', 'SYSTEM OVERVIEW', '1'],
  ['1.1', 'Description and Purpose of the System', '1'],
  ['1.2', 'System Architecture and Data Flow', '2'],
  ['1.3', 'Users and Roles', '3'],
  ['1.4', 'Data Sources and Pipeline [A] / Content Types [M]', '4'],
  ['CHAPTER 2', 'THREAT AND RISK ANALYSIS', '6'],
  ['2.1', 'Assets and Data Classification', '6'],
  ['2.2', 'Threats and Vulnerabilities', '7'],
  ['2.3', 'Risk Assessment Matrix', '9'],
  ['CHAPTER 3', 'SECURITY CONTROLS AND COMPLIANCE', '11'],
  ['3.1', 'Authentication and Role-Based Access Control', '11'],
  ['3.2', 'Encryption and Secure Coding', '12'],
  ['3.3', 'Data Protection [A] / Content Protection [M]', '14'],
  ['3.4', 'Compliance', '15'],
  ['CHAPTER 4', 'TESTING, CONCLUSION, AND RECOMMENDATIONS', '17'],
  ['4.1', 'Security Tests Performed and Results', '17'],
  ['4.2', 'Incident Response and Backup Plan', '19'],
  ['4.3', 'Summary and Recommendations', '20'],
  ['REFERENCES', '', '22'],
  ['APPENDICES', '', '23'],
];

const columnWidths = [1.7, 8.8, 0.7];
toc.addTable(tocRows, {
  x: 0.8,
  y: 1.2,
  w: 11.5,
  h: 4.8,
  border: { pt: 0.5, color: 'D5E6E1' },
  fill: { color: 'FFFFFF' },
  fontFace: 'Aptos',
  fontSize: 10,
  color: dark,
  margin: 0.07,
  columnW: columnWidths,
  valign: 'middle',
  align: 'left',
  autoFill: true,
  bold: false,
});
addFooter(toc, 2);

const overview = pptx.addSlide();
overview.background = { color: 'F5FAF7' };
overview.addText('CHAPTER 1 | SYSTEM OVERVIEW', {
  x: 0.6,
  y: 0.4,
  w: 11.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 26,
  bold: true,
  color: dark,
});
overview.addText('MaternaCare is a web-based maternal health information system designed to help barangay health workers and municipality personnel manage pregnancy records, monitor patient status, schedule appointments, and coordinate resource needs through secure digital workflows.', {
  x: 0.8,
  y: 1.15,
  w: 8.8,
  h: 1.3,
  fontFace: 'Aptos',
  fontSize: 18,
  color: dark,
  margin: 0.08,
});

const cards = [
  ['Purpose', 'Track maternal care, document health conditions, and support timely interventions for high-risk pregnancies.'],
  ['Scope', 'Supports patient records, appointment scheduling, vital sign capture, barangay inventory, and SMS reminders.'],
  ['Value', 'Improves continuity of care, facilitates faster decision-making, and reduces missed follow-ups.'],
];

cards.forEach((card, idx) => {
  const x = 0.8 + idx * 3.7;
  overview.addShape(pptx.ShapeType.rect, {
    x,
    y: 2.8,
    w: 3.2,
    h: 2.6,
    fill: { color: idx % 2 === 0 ? 'EAF6F2' : 'EFF6FF' },
    line: { color: green, pt: 1.2 },
    radius: 0.08,
  });
  overview.addText(card[0], {
    x: x + 0.2,
    y: 3.0,
    w: 2.8,
    h: 0.4,
    fontFace: 'Aptos',
    fontSize: 16,
    bold: true,
    color: dark,
  });
  overview.addText(card[1], {
    x: x + 0.2,
    y: 3.6,
    w: 2.8,
    h: 1.2,
    fontFace: 'Aptos',
    fontSize: 12,
    color: '334155',
    margin: 0.05,
    valign: 'top',
    fit: 'shrink',
  });
});
addFooter(overview, 3);

const architecture = pptx.addSlide();
architecture.background = { color: 'FFFFFF' };
architecture.addText('1.2 | SYSTEM ARCHITECTURE AND DATA FLOW', {
  x: 0.6,
  y: 0.4,
  w: 10.5,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});

const boxes = [
  ['Patient / Health Worker', 'Web interface for recording and reviewing maternal care data'],
  ['Express.js API', 'Handles authentication, records, appointments, and reporting logic'],
  ['MySQL Database', 'Stores patient profiles, health histories, inventory, and SMS logs'],
  ['PhilSMS Gateway', 'Delivers reminders and care updates to patient contacts'],
];

boxes.forEach((item, idx) => {
  const x = 0.8 + (idx % 2) * 5.4;
  const y = 1.5 + (idx > 1 ? 2.1 : 0);
  architecture.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 4.5,
    h: 1.5,
    fill: { color: idx % 2 === 0 ? 'EAF6F2' : 'ECF7FF' },
    line: { color: green, pt: 1.2 },
    radius: 0.12,
  });
  architecture.addText(item[0], {
    x: x + 0.2,
    y: y + 0.2,
    w: 4.1,
    h: 0.45,
    fontFace: 'Aptos',
    fontSize: 15,
    bold: true,
    color: dark,
  });
  architecture.addText(item[1], {
    x: x + 0.2,
    y: y + 0.7,
    w: 4.1,
    h: 0.55,
    fontFace: 'Aptos',
    fontSize: 10,
    color: '334155',
    margin: 0.05,
  });
});
addFooter(architecture, 4);

const users = pptx.addSlide();
users.background = { color: 'F5F9F7' };
users.addText('1.3 | USERS AND ROLES', {
  x: 0.6,
  y: 0.4,
  w: 9.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});

const roleCards = [
  ['Barangay Health Worker (BHW)', ['Manage maternal records', 'Schedule follow-ups', 'Track inventory and resource requests', 'Send reminders via SMS']],
  ['Municipality Personnel', ['Review barangay requests', 'Monitor health coverage', 'Coordinate resource allocation', 'Support cross-barangay oversight']],
  ['System Support / Admin', ['Configures environment variables', 'Maintains database and security settings', 'Monitors uptime and system health']],
];

roleCards.forEach((role, idx) => {
  const x = 0.8 + idx * 4.0;
  users.addShape(pptx.ShapeType.roundRect, {
    x,
    y: 1.5,
    w: 3.5,
    h: 4.0,
    fill: { color: idx === 0 ? 'EAF6F2' : idx === 1 ? 'EEF5FF' : 'F5EFE8' },
    line: { color: idx === 0 ? green : idx === 1 ? blue : gold, pt: 1.2 },
    radius: 0.12,
  });
  users.addText(role[0], {
    x: x + 0.22,
    y: 1.8,
    w: 3.1,
    h: 0.45,
    fontFace: 'Aptos',
    fontSize: 16,
    bold: true,
    color: dark,
  });
  users.addText(role[1].map(item => `• ${item}\n`).join(''), {
    x: x + 0.25,
    y: 2.5,
    w: 2.9,
    h: 2.2,
    fontFace: 'Aptos',
    fontSize: 11,
    color: '334155',
    margin: 0.08,
  });
});
addFooter(users, 5);

const dataSources = pptx.addSlide();
dataSources.background = { color: 'FFFFFF' };
dataSources.addText('1.4 | DATA SOURCES AND PIPELINE / CONTENT TYPES', {
  x: 0.6,
  y: 0.4,
  w: 11.6,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 23,
  bold: true,
  color: dark,
});

dataSources.addText('Primary data sources: patient record forms, vital-sign entries, barangay inventory transactions, appointment logs, and SMS reminders. Content types include structured patient demographics, JSON health profiles, pregnancy histories, resource requests, and time-based alerts.', {
  x: 0.8,
  y: 1.2,
  w: 11.2,
  h: 1.2,
  fontFace: 'Aptos',
  fontSize: 16,
  color: dark,
  margin: 0.06,
});

const pipeline = [
  ['Data Entry', 'Forms and profile updates from BHW/municipality'],
  ['Validation Layer', 'Field checks, role restriction, and record integrity validation'],
  ['Processing', 'Appointment logic, risk evaluation, and resource monitoring'],
  ['Storage', 'MySQL tables for maternal, inventory, and SMS records'],
  ['Reporting / Alerts', 'Dashboard reports, notifications, and PhilSMS reminders'],
];

pipeline.forEach((step, idx) => {
  const x = 0.8 + idx * 2.2;
  dataSources.addShape(pptx.ShapeType.roundRect, {
    x,
    y: 2.9,
    w: 1.9,
    h: 2.5,
    fill: { color: idx % 2 === 0 ? 'EAF6F2' : 'F0F6FF' },
    line: { color: green, pt: 1 },
    radius: 0.1,
  });
  dataSources.addText(step[0], {
    x: x + 0.15,
    y: 3.25,
    w: 1.6,
    h: 0.4,
    fontFace: 'Aptos',
    fontSize: 11,
    bold: true,
    color: dark,
    align: 'center',
  });
  dataSources.addText(step[1], {
    x: x + 0.12,
    y: 3.75,
    w: 1.7,
    h: 1.1,
    fontFace: 'Aptos',
    fontSize: 9,
    color: '334155',
    align: 'center',
    fit: 'shrink',
  });
});
addFooter(dataSources, 6);

const riskAnalysis = pptx.addSlide();
riskAnalysis.background = { color: 'F8FAF9' };
riskAnalysis.addText('CHAPTER 2 | THREAT AND RISK ANALYSIS', {
  x: 0.6,
  y: 0.4,
  w: 11.5,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 26,
  bold: true,
  color: dark,
});

const assetTable = [
  ['Asset', 'Type', 'Sensitivity', 'Risk Notes'],
  ['Maternal patient records', 'PII and medical data', 'High', 'Contains personal, medical, and contact information'],
  ['Inventory / resource needs', 'Operational data', 'Medium', 'Affects local service availability and planning'],
  ['User credentials', 'Authentication data', 'High', 'Compromise can escalate access across the platform'],
  ['Appointment and SMS logs', 'Operational and communication traces', 'Medium', 'Important for follow-up accuracy and auditability'],
];

riskAnalysis.addTable(assetTable, {
  x: 0.8,
  y: 1.5,
  w: 11.4,
  h: 2.9,
  border: { pt: 0.8, color: 'D9EAE4' },
  fill: { color: 'FFFFFF' },
  fontFace: 'Aptos',
  fontSize: 11,
  color: dark,
  margin: 0.08,
  autoFill: true,
});
addFooter(riskAnalysis, 7);

const threats = pptx.addSlide();
threats.background = { color: 'FFFFFF' };
threats.addText('2.2 | THREATS AND VULNERABILITIES', {
  x: 0.6,
  y: 0.4,
  w: 10.7,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});

const threatBullets = [
  'Unauthorized access to patient data through stolen credentials or weak role enforcement.',
  'Disclosure of sensitive records through insecure transmission or poor storage controls.',
  'Improper data modification caused by missing validation or malicious tampering of records.',
  'SMS interception or message misuse when communication channels are not protected.',
  'Insider abuse, accidental exposure, or lack of audit records over resource requests and updates.',
];

threats.addText(threatBullets.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 1.5,
  w: 8.8,
  h: 3.8,
  fontFace: 'Aptos',
  fontSize: 18,
  color: dark,
  margin: 0.12,
});

threats.addShape(pptx.ShapeType.roundRect, {
  x: 9.8,
  y: 1.7,
  w: 3.8,
  h: 3.0,
  fill: { color: 'EEF7F4' },
  line: { color: green, pt: 1.2 },
  radius: 0.12,
});
threats.addText('Key vulnerabilities', {
  x: 10.0,
  y: 2.0,
  w: 3.2,
  h: 0.4,
  fontFace: 'Aptos',
  fontSize: 16,
  bold: true,
  color: dark,
});
threats.addText('Weak password handling, missing audit logs, insufficient least-privilege checks, and unvalidated inputs are major concerns in data-heavy health systems.', {
  x: 10.0,
  y: 2.7,
  w: 3.2,
  h: 1.5,
  fontFace: 'Aptos',
  fontSize: 11,
  color: '334155',
  margin: 0.05,
});
addFooter(threats, 8);

const riskMatrix = pptx.addSlide();
riskMatrix.background = { color: 'F8FAF9' };
riskMatrix.addText('2.3 | RISK ASSESSMENT MATRIX', {
  x: 0.6,
  y: 0.4,
  w: 11.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});

const matrixRows = [
  ['Threat', 'Likelihood', 'Impact', 'Risk', 'Mitigation'],
  ['Unauthorized access', 'Medium', 'High', 'High', 'RBAC + session expiry + password hashing'],
  ['Sensitive data breach', 'Medium', 'High', 'High', 'Encryption and access restrictions'],
  ['Record tampering', 'Low', 'High', 'Medium', 'Validation, audit trails, and restricted editing'],
  ['SMS misuse', 'Medium', 'Medium', 'Medium', 'Use trusted provider and log delivery status'],
  ['Inventory manipulation', 'Low', 'Medium', 'Medium', 'Approval flow and role-based access'],
];

riskMatrix.addTable(matrixRows, {
  x: 0.8,
  y: 1.5,
  w: 11.4,
  h: 3.6,
  border: { pt: 0.8, color: 'D9EAE4' },
  fill: { color: 'FFFFFF' },
  fontFace: 'Aptos',
  fontSize: 10,
  color: dark,
  margin: 0.08,
  autoFill: true,
});
addFooter(riskMatrix, 9);

const securityControls = pptx.addSlide();
securityControls.background = { color: 'FFFFFF' };
securityControls.addText('CHAPTER 3 | SECURITY CONTROLS AND COMPLIANCE', {
  x: 0.6,
  y: 0.4,
  w: 11.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 26,
  bold: true,
  color: dark,
});

const authBullets = [
  'Usernames are unique and passwords are stored as hashes in the application layer.',
  'Session tokens are assigned with expiration times to limit unauthorized persistence.',
  'Authentication is enforced before any health record, appointment, or inventory action is allowed.',
  'RBAC restricts operations to BHW and municipality roles, preventing cross-role access.',
];

securityControls.addText('3.1 | AUTHENTICATION AND ROLE-BASED ACCESS CONTROL', {
  x: 0.8,
  y: 1.2,
  w: 8.0,
  h: 0.4,
  fontFace: 'Aptos',
  fontSize: 20,
  bold: true,
  color: green,
});
securityControls.addText(authBullets.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 1.9,
  w: 7.5,
  h: 2.8,
  fontFace: 'Aptos',
  fontSize: 15,
  color: dark,
  margin: 0.08,
});

securityControls.addShape(pptx.ShapeType.roundRect, {
  x: 9.0,
  y: 1.8,
  w: 2.7,
  h: 2.6,
  fill: { color: 'EEF7F4' },
  line: { color: green, pt: 1.2 },
  radius: 0.12,
});
securityControls.addText('Role access', {
  x: 9.2,
  y: 2.0,
  w: 2.2,
  h: 0.3,
  fontFace: 'Aptos',
  fontSize: 14,
  bold: true,
  color: dark,
  align: 'center',
});
securityControls.addText('BHW\nMunicipality', {
  x: 9.2,
  y: 2.6,
  w: 2.2,
  h: 1.4,
  fontFace: 'Aptos',
  fontSize: 14,
  color: dark,
  align: 'center',
});
addFooter(securityControls, 10);

const encryption = pptx.addSlide();
encryption.background = { color: 'F5FAF7' };
encryption.addText('3.2 | ENCRYPTION AND SECURE CODING', {
  x: 0.6,
  y: 0.4,
  w: 10.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});
const codingBullets = [
  'Sensitive credentials and session information are handled in a controlled and restricted application layer.',
  'Prepared statements and parameterized queries reduce the risk of SQL injection during database operations.',
  'Input validation is required for patient information, appointments, and barangay inventory updates.',
  'Secure coding practices include least-privilege logic, structured error handling, and role-aware routing.',
  'HTTPS/TLS is required in production to protect data in transit between clients and server endpoints.',
];

encryption.addText(codingBullets.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 1.5,
  w: 9.5,
  h: 3.8,
  fontFace: 'Aptos',
  fontSize: 15,
  color: dark,
  margin: 0.1,
});
addFooter(encryption, 11);

const compliance = pptx.addSlide();
compliance.background = { color: 'FFFFFF' };
compliance.addText('3.3 | DATA PROTECTION / CONTENT PROTECTION / COMPLIANCE', {
  x: 0.6,
  y: 0.4,
  w: 11.5,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 22,
  bold: true,
  color: dark,
});

const complianceRows = [
  ['Control Area', 'Implementation'],
  ['Data privacy', 'Access is restricted by role and only necessary data is exposed to the correct user group'],
  ['Consent & confidentiality', 'Maternal records are accessed by authorized personnel and stored in a controlled health workflow'],
  ['Auditability', 'Operations and status changes are traceable across appointments, inventory, and requests'],
  ['Operational compliance', 'Configuration keys are separated into environment variables and deployment settings follow a safer pattern'],
  ['Security posture', 'System is designed to align with common healthcare data handling requirements and privacy best practices'],
];

compliance.addTable(complianceRows, {
  x: 0.8,
  y: 1.4,
  w: 11.2,
  h: 4.0,
  border: { pt: 0.8, color: 'D9EAE4' },
  fill: { color: 'FFFFFF' },
  fontFace: 'Aptos',
  fontSize: 10,
  color: dark,
  margin: 0.08,
  autoFill: true,
});
addFooter(compliance, 12);

const testing = pptx.addSlide();
testing.background = { color: 'F8FAF9' };
testing.addText('CHAPTER 4 | TESTING, CONCLUSION, AND RECOMMENDATIONS', {
  x: 0.6,
  y: 0.4,
  w: 11.5,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 25,
  bold: true,
  color: dark,
});

const testRows = [
  ['Area', 'Checks performed', 'Result'],
  ['Authentication', 'Role gating and session validation', 'Passed'],
  ['Appointments', 'Scheduling logic and reminder triggers', 'Passed'],
  ['Inventory', 'Barangay supply updates and balance checks', 'Passed'],
  ['Security', 'Input validation and controlled access patterns', 'Needs periodic review'],
  ['Operations', 'Function flow across records, resource requests, and alerts', 'Stable'],
];

testing.addTable(testRows, {
  x: 0.8,
  y: 1.6,
  w: 11.2,
  h: 2.8,
  border: { pt: 0.8, color: 'D9EAE4' },
  fill: { color: 'FFFFFF' },
  fontFace: 'Aptos',
  fontSize: 11,
  color: dark,
  margin: 0.08,
  autoFill: true,
});
addFooter(testing, 13);

const response = pptx.addSlide();
response.background = { color: 'FFFFFF' };
response.addText('4.2 | INCIDENT RESPONSE AND BACKUP PLAN', {
  x: 0.6,
  y: 0.4,
  w: 10.7,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});
const steps = [
  'Detect and isolate issues such as unauthorized access, failed SMS delivery, or data update anomalies.',
  'Notify the department owner and preserve evidence from logs, database records, and system status monitors.',
  'Restore service from backup procedures, validate data integrity, and confirm all role permissions remain correct.',
  'Review the cause and improve access policies, monitoring, and logging before resuming normal operations.',
];
response.addText(steps.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 1.5,
  w: 8.7,
  h: 3.8,
  fontFace: 'Aptos',
  fontSize: 16,
  color: dark,
  margin: 0.1,
});
response.addShape(pptx.ShapeType.roundRect, {
  x: 9.8,
  y: 1.8,
  w: 2.9,
  h: 2.5,
  fill: { color: 'EEF7F4' },
  line: { color: green, pt: 1.2 },
  radius: 0.12,
});
response.addText('Backup plan', {
  x: 10.0,
  y: 2.2,
  w: 2.5,
  h: 0.3,
  fontFace: 'Aptos',
  fontSize: 14,
  bold: true,
  color: dark,
  align: 'center',
});
response.addText('Daily database backups\nVersioned environment settings\nRecovery checklist for critical operations', {
  x: 10.0,
  y: 2.8,
  w: 2.5,
  h: 1.3,
  fontFace: 'Aptos',
  fontSize: 10,
  color: '334155',
  align: 'center',
});
addFooter(response, 14);

const summary = pptx.addSlide();
summary.background = { color: 'F7F9F8' };
summary.addText('4.3 | SUMMARY AND RECOMMENDATIONS', {
  x: 0.6,
  y: 0.4,
  w: 10.8,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});
summary.addText('MaternaCare combines maternal health management, appointment coordination, barangay inventory tracking, and SMS reminders into a practical digital workflow. The platform strengthens care continuity, improves operational visibility, and reduces missed follow-up appointments. To sustain security, the system should continue enforcing RBAC, stronger logging, regular backup validation, and secure deployment practices.', {
  x: 0.9,
  y: 1.5,
  w: 11.0,
  h: 2.2,
  fontFace: 'Aptos',
  fontSize: 17,
  color: dark,
  margin: 0.08,
});
const recList = [
  'Strengthen production TLS and secure configuration management.',
  'Introduce periodic access reviews and granular permissions audits.',
  'Expand logging for all critical actions and failed login events.',
  'Validate backup recovery procedures and vulnerability scanning on recurring schedule.',
];
summary.addText(recList.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 4.0,
  w: 9.5,
  h: 1.8,
  fontFace: 'Aptos',
  fontSize: 15,
  color: dark,
  margin: 0.08,
});
addFooter(summary, 15);

const refs = pptx.addSlide();
refs.background = { color: 'FFFFFF' };
refs.addText('REFERENCES', {
  x: 0.6,
  y: 0.4,
  w: 8.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});
const refItems = [
  'MaternaCare application source files and database schema (server.js, database.sql, .env.example).',
  'PhilSMS API integration for reminder delivery and communication workflows.',
  'Barangay maternal health workflow requirements for patient monitoring and resource management.',
  'General secure software engineering and healthcare privacy best practices for access control and record handling.',
];
refs.addText(refItems.map(item => `• ${item}\n`).join(''), {
  x: 0.9,
  y: 1.5,
  w: 11.0,
  h: 3.4,
  fontFace: 'Aptos',
  fontSize: 15,
  color: dark,
  margin: 0.08,
});
addFooter(refs, 16);

const appendix = pptx.addSlide();
appendix.background = { color: 'F7F9F8' };
appendix.addText('APPENDICES', {
  x: 0.6,
  y: 0.4,
  w: 8.0,
  h: 0.5,
  fontFace: 'Aptos',
  fontSize: 24,
  bold: true,
  color: dark,
});
const appendices = [
  'Appendix A: Code Snippets and Configuration Files',
  'Appendix B: Test Screenshots and Logs',
  'Appendix C: Privacy and Consent Forms / Asset Licenses',
  'Appendix D: Curriculum Vitae',
];
appendix.addText(appendices.map(item => `${item}\n`).join(''), {
  x: 1.0,
  y: 1.7,
  w: 8.0,
  h: 2.5,
  fontFace: 'Aptos',
  fontSize: 18,
  color: dark,
});
addFooter(appendix, 17);

await pptx.writeFile({ fileName: 'MaternaCare_System_Presentation.pptx' });
console.log('Presentation created: MaternaCare_System_Presentation.pptx');
