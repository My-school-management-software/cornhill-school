/* Shared, testable CORNHILL Excel subject-code and term mapping rules.
   Kept dependency-free so the browser importer and Node test suite use the same code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CornhillMarkImportMapping = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function normalise(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function curriculumGroup(className) {
    const n = normalise(className);
    if (n.includes('BABY') || n.includes('MIDDLE') || n.includes('TOP') || n.includes('NURSERY')) return 'Nursery';
    if (/P[123]/.test(n) || /PRIMARY[123]/.test(n)) return 'P1-P3';
    if (/P[4567]/.test(n) || /PRIMARY[4567]/.test(n)) return 'P4-P7';
    return null;
  }
  function subjectKey(raw) {
    const name = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (name.includes('literacyii') || name.includes('literacy2')) return 'literacyii';
    if (name.includes('literacyi') || name.includes('literacy1')) return 'literacyi';
    if (name.includes('number') || name.includes('numeracy')) return 'number';
    if (name.includes('local')) return 'local';
    if (name.includes('language') || name.includes('communication')) return 'language';
    if (name.includes('reading') || name === 'read') return 'reading';
    if (name.includes('health')) return 'health';
    if (name.includes('social') || name.includes('sst')) return 'socialstudies';
    if (name.includes('writing') || name.includes('handwriting')) return 'writing';
    if (name.includes('drawing') || name.includes('shading') || name.includes('art')) return 'drawing';
    if (name.includes('english')) return 'english';
    if (name.includes('mathematics') || name.includes('maths')) return 'mathematics';
    if (name.includes('science')) return 'science';
    if (name.includes('religious') || name.includes('religion')) return 'religious';
    return name;
  }
  function subjectAliases(tokenValue, group) {
    const token = normalise(tokenValue);
    const common = {
      NU:['Numbers'], NUM:['Numbers'], EN:['English'], ENG:['English'],
      MTC:['Mathematics'], MT:['Mathematics'], MAT:['Mathematics'], MA:['Mathematics'], MATH:['Mathematics'],
      SC:['Science'], SCI:['Science'], SCC:['Science'], SST:['Social Studies'], SS:['Social Studies'],
      LI1:['Literacy I'], LIT1:['Literacy I'], LI:['Literacy I'], LIT:['Literacy I'],
      LIT2:['Literacy II'], LI2:['Literacy II'], LT2:['Literacy II'], L12:['Literacy II'],
      LL:['Local Language'], LL1:['Local Language'], LL2:['Local Language'], LOC:['Local Language'], LOCAL:['Local Language'],
      RR:['Local Language'], RUR:['Local Language'], RU:['Local Language'], RNY:['Local Language'],
      RNYANKORE:['Local Language'], RUNYANKORE:['Local Language'], NYANKORE:['Local Language'],
      RR1:['Local Language'], RR2:['Local Language'], RU1:['Local Language'], RU2:['Local Language'], RU3:['Local Language'],
      RE:['Religious Education'], CRE:['Religious Education'], HH:['Health Habits'], SD:['Social Development'],
      WR:['Writing'], WRI:['Writing'], DR:['Drawing'], DRAW:['Drawing'], LD:['Language Development']
    };
    if (group === 'Nursery') {
      if (token === 'EN' || token === 'LD') return ['Language Development'];
      if (token === 'RE') return ['Reading'];
      if (token === 'NU') return ['Numbers'];
    }
    if (group === 'P1-P3' && token === 'RE') return ['Religious Education'];
    return common[token] || [];
  }
  function codeDistance(aValue, bValue) {
    const a = normalise(aValue), b = normalise(bValue);
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  }
  function matchAssessment(input) {
    const header = input.header, className = input.className || '', period = input.period;
    const assessments = Array.isArray(input.assessments) ? input.assessments : [];
    const getPeriod = input.getAssessmentPeriod || (a => a.period);
    const getSubject = input.getSubjectName || (a => a.subject_name || a.subject || '');
    const getCode = input.getSuggestedCode || (a => a.code || '');
    const clean = normalise(header), token = clean.replace(/\d$/, '');
    const aliases = subjectAliases(token, curriculumGroup(className)).map(normalise);
    const candidates = assessments.filter(a => getPeriod(a) === period);
    const found = candidates.find(a => {
      const subject = normalise(getSubject(a));
      return subject === token || aliases.includes(subject) || subjectKey(getSubject(a)) === subjectKey(token);
    });
    if (found) return { assessment:found, matchedBySchoolAlias:aliases.includes(normalise(getSubject(found))) };
    if (aliases.length) {
      const aliasSubject = aliases[0];
      const availableForAnyPeriod = assessments.some(a => normalise(getSubject(a)) === aliasSubject);
      return {
        unavailableSubject:aliasSubject,
        detail:availableForAnyPeriod
          ? 'The code is recognised as '+aliasSubject+', but no assessment is available for the detected period in this account’s permitted subject list. Ask the administrator to check the class, term and assessment setup.'
          : 'The code is recognised as '+aliasSubject+', but no matching assessment is available in this account’s permitted subject list for this class. Ask the administrator to check class-subject assignment and mark-entry permission.'
      };
    }
    const suggestions=candidates.map(assessment=>({assessment,code:getCode(assessment)}))
      .map(item=>({...item,distance:codeDistance(clean,item.code)})).sort((a,b)=>a.distance-b.distance);
    return suggestions[0]?.distance<=1?{suggested:suggestions[0]}:{};
  }
  function workbookTermNumber(raw) {
    const value=normalise(raw);
    if (/(?:FIRST|1ST)TERM|TERM(?:ONE|1)/.test(value)) return 1;
    if (/(?:SECOND|2ND)TERM|TERM(?:TWO|2)/.test(value)) return 2;
    if (/(?:THIRD|3RD)TERM|TERM(?:THREE|3)/.test(value)) return 3;
    return null;
  }
  function phaseNumber(raw) {
    const n=normalise(raw);
    if (/SETIV|SET4|FOURTH/.test(n)) return 4;
    if (/SETIII|SET3|THIRD/.test(n)) return 3;
    if (/SETII|SET2|SECOND/.test(n)) return 2;
    if (/SETI|SET1|FIRST/.test(n)) return 1;
    if (/BOT|BEGINNING|STARTOFTERM/.test(n)) return 1;
    if (/MIDTERM/.test(n) || /\bMID\b/i.test(String(raw ?? ''))) return 2;
    if (/EOT|ENDOFTERM|ENDTERM/.test(n)) return 3;
    return null;
  }
  // Match the browser importer's period inference, including headings such as
  // Middle's unnumbered RE / H.H / SD columns after the TT1 and PN1 columns.
  function columnPeriod(matrix,headerRow,col,header,activePeriod,sheetName) {
    let grouped=null;
    for(let r=Math.max(0,headerRow-3);r<headerRow;r++){
      let carried=null;
      for(let c=0;c<=col;c++){
        const value=matrix?.[r]?.[c];
        if(value!==null&&value!==undefined&&String(value).trim()){
          const detected=phaseNumber(value);
          if(detected!==null)carried=detected;
        }
      }
      if(carried!==null)grouped=carried;
    }
    const sheetPhase=phaseNumber(sheetName);
    const suffix=normalise(header).match(/([1-4])$/);
    const codePeriod=suffix?Number(suffix[1]):null;
    const explicit=grouped??sheetPhase;
    return {period:explicit??codePeriod??activePeriod,explicit:explicit!==null&&explicit!==undefined,codePeriod};
  }
  function parseMarkValue(raw,maxScore,allowAbsent) {
    const value=String(raw??'').trim();
    if(value==='')return {valid:true,blank:true,absent:false,score:null};
    if(value.toUpperCase()==='X'){
      return allowAbsent
        ? {valid:true,blank:false,absent:true,score:0}
        : {valid:false,blank:false,absent:true,score:null,reason:'absent_not_allowed'};
    }
    const score=Number(value);
    if(!Number.isFinite(score))return {valid:false,blank:false,absent:false,score:null,reason:'not_numeric'};
    if(score<0||score>Number(maxScore))return {valid:false,blank:false,absent:false,score,reason:'out_of_range'};
    return {valid:true,blank:false,absent:false,score};
  }
  function isSummaryLearnerRow(raw) {
    const clean=String(raw??'').trim();
    if(!clean) return true;
    const key=normalise(clean);
    if(/^\d+$/.test(clean)) return true;
    if(key.startsWith('TOTAL')) return true;
    if([
      'BOYS','GIRLS','CLASSTEACHER','HEADTEACHER','SIGNATURE',
      'DIVISION','DIVISIONI','DIVISIONII','DIVISIONIII','DIVISIONIV','DIVISIONU','DIVISIONX',
      'NOOFPUPILS','NUMBEROFPUPILS','TOTALPUPILS','TOTALLEARNERS','CLASSSTRENGTH',
      'CLASSENROLMENT','CLASSENROLLMENT','BOARDING','BOARDERS','DAY','DAYSCHOLARS'
    ].includes(key)) return true;
    return key.includes('GRADINGANALYSIS') || key.includes('PERFORMANCEBY') || key.includes('PERFOMANCEBY');
  }
  return {normalise,curriculumGroup,subjectKey,subjectAliases,codeDistance,matchAssessment,workbookTermNumber,phaseNumber,columnPeriod,parseMarkValue,isSummaryLearnerRow};
});
