const test = require('node:test');
const assert = require('node:assert/strict');
const mapping = require('../assets/cornhill-mark-import-mapping.js');

function assessments(subjects,period){return subjects.map((subject,index)=>({id:period+'-'+index,subject,period}));}
function match(header,className,period,rows){
 return mapping.matchAssessment({header,className,period,assessments:rows,getAssessmentPeriod:item=>item.period,getSubjectName:item=>item.subject,getSuggestedCode:item=>item.subject});
}

test('Middle codes map to all seven curriculum areas in all three periods',()=>{
 const expected=[['NU','Numbers'],['EN','Language Development'],['WR','Writing'],['HH','Health Habits'],['RE','Reading'],['SD','Social Development'],['DR','Drawing']];
 for(const [period,suffix] of [['Beginning',1],['Midterm',2],['End',3]]){
  const rows=assessments(expected.map(x=>x[1]),period);
  for(const [prefix,subject] of expected){
   const result=match(prefix+suffix,'Middle',period,rows);
   assert.equal(result.assessment?.subject,subject,prefix+suffix+' → '+subject+' ('+period+')');
   assert.equal(result.matchedBySchoolAlias,true);
  }
 }
});

test('P6/P7 accept SCC as Science and SST/SS as Social Studies',()=>{
 const rows=assessments(['English','Mathematics','Science','Social Studies'],'Set I');
 for(const [code,subject] of [['ENG1','English'],['MAT1','Mathematics'],['SCC1','Science'],['SST1','Social Studies']])
  assert.equal(match(code,'P6','Set I',rows).assessment?.subject,subject,code+' → '+subject);
});

test('P6 Set II and Set III stay period-specific',()=>{
 const rows=[...assessments(['English','Mathematics','Science','Social Studies'],'Set II'),...assessments(['English','Mathematics','Science','Social Studies'],'Set III')];
 assert.equal(match('SCC2','P6','Set II',rows).assessment?.period,'Set II');
 assert.equal(match('SST3','P6','Set III',rows).assessment?.period,'Set III');
});

test('P1–P3 Religious Education and Literacy II aliases are separate from Nursery meanings',()=>{
 const lower=assessments(['English','Mathematics','Literacy I','Literacy II','Local Language','Religious Education'],'Beginning');
 assert.equal(match('RE1','P1','Beginning',lower).assessment?.subject,'Religious Education');
 assert.equal(match('LIT21','P1','Beginning',lower).assessment?.subject,'Literacy II');
 const nursery=assessments(['Language Development','Reading'],'Beginning');
 assert.equal(match('EN1','Middle','Beginning',nursery).assessment?.subject,'Language Development');
 assert.equal(match('RE1','Middle','Beginning',nursery).assessment?.subject,'Reading');
});

test('a recognised subject outside the permitted list is reported, never remapped',()=>{
 const rows=assessments(['English','Mathematics','Science'],'Set I');
 const result=match('SST1','P6','Set I',rows);
 assert.equal(result.assessment,undefined);
 assert.equal(result.unavailableSubject,'SOCIALSTUDIES');
});

test('unknown codes remain for manual review',()=>{
 const result=match('BIO1','P6','Set I',assessments(['English','Mathematics','Science','Social Studies'],'Set I'));
 assert.equal(result.assessment,undefined);
 assert.equal(result.unavailableSubject,undefined);
});

test('worksheet academic term is distinct from assessment phase',()=>{
 assert.equal(mapping.workbookTermNumber('MIDDLE 1ST TERM'),1);
 assert.equal(mapping.workbookTermNumber('TERM 3'),3);
 assert.equal(mapping.workbookTermNumber('MIDDLE CLASS'),null);
 assert.equal(mapping.phaseNumber('Beginning'),1);
 assert.equal(mapping.phaseNumber('MID'),2);
 assert.equal(mapping.phaseNumber('End of Term'),3);
 assert.equal(mapping.phaseNumber('Set III'),3);
});
