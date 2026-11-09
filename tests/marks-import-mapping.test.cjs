const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const mapping=require('../assets/cornhill-mark-import-mapping.js');

function makeAssessments(items,period){
 return items.map(([subject,code],index)=>({id:period+'-'+index,subject,code,period}));
}
function runMatch(header,className,period,rows){
 return mapping.matchAssessment({header,className,period,assessments:rows,getAssessmentPeriod:x=>x.period,getSubjectName:x=>x.subject,getSuggestedCode:x=>x.code});
}
function assertCodes(className,period,codes){
 const rows=makeAssessments(codes.map(x=>[x[1],x[0]]),period);
 for(const [code,subject] of codes){
  const result=runMatch(code,className,period,rows);
  assert.equal(result.assessment?.subject,subject, className+' '+period+' '+code+' → '+subject);
  assert.equal(result.matchedBySchoolAlias,true,className+' '+code+' should be marked as recognised school alias');
 }
}

test('Middle class: all seven official codes map in Beginning, Midterm and End (42 assertions)',()=>{
 const codes=[['NU1','Numbers'],['EN1','Language Development'],['WR1','Writing'],['HH1','Health Habits'],['RE1','Reading'],['SD1','Social Development'],['DR1','Drawing']];
 for(const [period,suffix] of [['Beginning',1],['Midterm',2],['End',3]]){
  assertCodes('Middle',period,codes.map(([code,subject])=>[code.slice(0,-1)+suffix,subject]));
 }
});

test('P1: all six subjects map across three periods (36 assertions)',()=>{
 const periods=[
  ['Beginning',[['ENG1','English'],['MTC1','Mathematics'],['LIT1','Literacy I'],['LIT21','Literacy II'],['LL1','Local Language'],['RE1','Religious Education']]],
  ['Midterm',[['EN2','English'],['MT2','Mathematics'],['LI12','Literacy I'],['LI22','Literacy II'],['LL2','Local Language'],['RE2','Religious Education']]],
  ['End',[['EN3','English'],['MT3','Mathematics'],['LI13','Literacy I'],['L123','Literacy II'],['LL3','Local Language'],['RE3','Religious Education']]]
 ];
 for(const [period,codes] of periods)assertCodes('P1',period,codes);
});

test('P2: all six subjects map across three periods (36 assertions)',()=>{
 const periods=[
  ['Beginning',[['MT1','Mathematics'],['EN1','English'],['LI11','Literacy I'],['LL1','Local Language'],['LI21','Literacy II'],['RE1','Religious Education']]],
  ['Midterm',[['MT2','Mathematics'],['EN2','English'],['LI12','Literacy I'],['LL2','Local Language'],['LI22','Literacy II'],['RE2','Religious Education']]],
  ['End',[['MT3','Mathematics'],['EN3','English'],['LI13','Literacy I'],['LL3','Local Language'],['LI23','Literacy II'],['RE3','Religious Education']]]
 ];
 for(const [period,codes] of periods)assertCodes('P2',period,codes);
});

test('P3: all six subjects map across three periods (36 assertions)',()=>{
 const periods=[
  ['Beginning',[['EN1','English'],['MT1','Mathematics'],['LI11','Literacy I'],['LT21','Literacy II'],['RE1','Religious Education'],['LL1','Local Language']]],
  ['Midterm',[['EN2','English'],['MT2','Mathematics'],['LI12','Literacy I'],['LI22','Literacy II'],['RE2','Religious Education'],['LL2','Local Language']]],
  ['End',[['EN3','English'],['MT3','Mathematics'],['LI3','Literacy I'],['LI23','Literacy II'],['RE3','Religious Education'],['LL3','Local Language']]]
 ];
 for(const [period,codes] of periods)assertCodes('P3',period,codes);
});

test('P4 and P5: all four core subjects map across all three periods (24 assertions)',()=>{
 const p4=[
  ['Beginning',[['MT1','Mathematics'],['EN1','English'],['SC1','Science'],['SST1','Social Studies']]],
  ['Midterm',[['MT2','Mathematics'],['EN2','English'],['SC2','Science'],['SS2','Social Studies']]],
  ['End',[['MT3','Mathematics'],['EN3','English'],['SC3','Science'],['SS3','Social Studies']]]
 ];
 const p5=[
  ['Beginning',[['EN1','English'],['MT1','Mathematics'],['SC1','Science'],['SS1','Social Studies']]],
  ['Midterm',[['ENG2','English'],['MT2','Mathematics'],['SC2','Science'],['SS2','Social Studies']]],
  ['End',[['EN3','English'],['MT3','Mathematics'],['SC3','Science'],['SS3','Social Studies']]]
 ];
 for(const [period,codes] of p4)assertCodes('P4',period,codes);
 for(const [period,codes] of p5)assertCodes('P5',period,codes);
});

test('P6 and P7: English, Mathematics, Science (SCC) and Social Studies map in every set (28 subject checks)',()=>{
 const p6=[
  ['Set I',[['ENG1','English'],['MAT1','Mathematics'],['SCC1','Science'],['SST1','Social Studies']]],
  ['Set II',[['ENG2','English'],['MAT2','Mathematics'],['SCC2','Science'],['SST2','Social Studies']]],
  ['Set III',[['ENG3','English'],['MT3','Mathematics'],['SCC3','Science'],['SST3','Social Studies']]]
 ];
 const p7=[
  ['Set I',[['ENG1','English'],['MAT1','Mathematics'],['SCC1','Science'],['SST1','Social Studies']]],
  ['Set II',[['EN2','English'],['MA2','Mathematics'],['SC2','Science'],['SS2','Social Studies']]],
  ['Set III',[['ENG3','English'],['MAT3','Mathematics'],['SCC3','Science'],['SST3','Social Studies']]],
  ['Set IV',[['ENG4','English'],['MAT4','Mathematics'],['SCC4','Science'],['SST4','Social Studies']]]
 ];
 for(const [period,codes] of p6)assertCodes('P6',period,codes);
 for(const [period,codes] of p7)assertCodes('P7',period,codes);
});

test('recognised but unassigned subjects are reported rather than remapped',()=>{
 const rows=makeAssessments([['English','ENG1'],['Mathematics','MAT1'],['Science','SCC1']],'Set I');
 const result=runMatch('SST1','P6','Set I',rows);
 assert.equal(result.assessment,undefined);
 assert.equal(result.unavailableSubject,'SOCIALSTUDIES');
 assert.match(result.detail,/permitted subject list/);
});

test('unknown headings remain for manual review',()=>{
 const rows=makeAssessments([['English','ENG1'],['Mathematics','MAT1'],['Science','SCC1'],['Social Studies','SST1']],'Set I');
 const result=runMatch('BIO1','P6','Set I',rows);
 assert.equal(result.assessment,undefined);
 assert.equal(result.unavailableSubject,undefined);
});

test('academic-term labels are separate from assessment-period labels',()=>{
 assert.equal(mapping.workbookTermNumber('MIDDLE 1ST TERM'),1);
 assert.equal(mapping.workbookTermNumber('TERM 3'),3);
 assert.equal(mapping.workbookTermNumber('MIDDLE CLASS'),null);
 assert.equal(mapping.phaseNumber('Beginning'),1);
 assert.equal(mapping.phaseNumber('MID'),2);
 assert.equal(mapping.phaseNumber('Midterm'),2);
 assert.equal(mapping.phaseNumber('End of Term'),3);
 assert.equal(mapping.phaseNumber('Set III'),3);
});

test('browser importer loads the tested helper and honours missing-subject states',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
 assert.ok(html.includes('<script src="/assets/cornhill-mark-import-mapping.js"></script>'));
 assert.ok(html.includes('return shared.matchAssessment('));
 assert.ok(html.includes("status:'Subject unavailable'"));
 assert.ok(html.includes('match.matchedBySchoolAlias'));
 assert.ok(html.includes('The term label is read from the Excel worksheet tab name'));
 assert.ok(html.includes("science:'SCC1',socialstudies:'SST1'"));
 assert.ok(html.includes('Selected class: '+ "'"));
 assert.ok(html.includes('Excel worksheet tab: '+ "'"));
});
