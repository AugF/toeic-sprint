import assert from "node:assert/strict";
import test from "node:test";
import {knowledgeValidationErrors,normalizeKnowledgeV2} from "../scripts/build-multi-bank.mjs";

const contextualKnowledge={
  source_scope:"material",
  vocabulary:[{
    term:"reimbursement",
    meaning:"报销；偿还款项",
    source_quote:"submit a reimbursement request before Friday",
    why:"财务和差旅场景中的高频职场词",
    confidence:.94
  },{
    term:"meeting",
    meaning:"会议",
    source_quote:"attend the meeting on Friday",
    why:"这是一个值得积累的普通单词",
    confidence:.99
  }],
  collocations:[{
    phrase:"submit a reimbursement request",
    meaning:"提交报销申请",
    source_quote:"Please submit a reimbursement request before Friday.",
    why:"可迁移到公司报销流程与行政通知",
    confidence:.92
  }]
};

const materialGroup={
  transcript:"Please submit a reimbursement request before Friday. Then attend the meeting on Friday.",
  items:[
    {question:"What should the employee submit?",choices:["A résumé","A reimbursement request","A schedule"]},
    {question:"When is the meeting?",choices:["On Friday","On Monday","Next month"]}
  ]
};

test("uses full shared material plus every question and option as knowledge evidence",()=>{
  const item=materialGroup.items[0];
  const value=normalizeKnowledgeV2(contextualKnowledge,3,item,materialGroup,materialGroup.items);
  assert.equal(value.schema_version,"2.0");
  assert.equal(value.source_scope,"material");
  assert.equal(value.extraction_basis,"full_exercise");
  assert.deepEqual(value.source_fields,["transcript"]);
  assert.deepEqual(value.vocabulary.map(entry=>entry.term),["reimbursement"]);
  assert.deepEqual(value.collocations.map(entry=>entry.phrase),["submit a reimbursement request"]);
  assert.equal(value.collocations[0].source_quote,"Please submit a reimbursement request before Friday.");
});

test("accepts valuable evidence from another question in the same official set",()=>{
  const raw={
    source_scope:"material",
    collocations:[{
      phrase:"reimbursement request",
      meaning:"报销申请",
      source_quote:"A reimbursement request",
      why:"名词搭配常用于差旅和财务流程",
      confidence:.9
    }]
  };
  const value=normalizeKnowledgeV2(raw,3,materialGroup.items[1],{items:materialGroup.items},materialGroup.items);
  assert.equal(value.collocations[0].source_field,"choice");
});

test("does not publish legacy answer-derived knowledge or force empty sections",()=>{
  const item={
    question:"What time does the restaurant close?",
    choices:["At eleven o'clock.","Near the library.","It does not."],
    knowledge_accumulation:{
      vocabulary:[{term:"eleven",meaning:"出现在本题正确表达中：十一点。"}],
      collocations:[{phrase:"At eleven o'clock.",meaning:"十一点。"}]
    }
  };
  const rejected=normalizeKnowledgeV2(item.knowledge_v2,2,item,item,[item]);
  assert.equal(rejected,undefined);
  const tooEasy=normalizeKnowledgeV2({
    source_scope:"question_context",
    vocabulary:[{term:"meeting",meaning:"会议",source_quote:"meeting",why:"本题值得掌握的单词",confidence:.99}],
    collocations:[{phrase:"thank you",meaning:"谢谢",source_quote:"thank you",why:"用于表达感谢的普通短语",confidence:.99}]
  },2,item,item,[item]);
  assert.equal(tooEasy,undefined);
});

test("rejects knowledge sourced from explanations, translations or OCR noise",()=>{
  const item={question:"When will the office close?",choices:["At five","Tomorrow","It moved"]};
  const rejected=normalizeKnowledgeV2({
    source_scope:"question_context",
    vocabulary:[
      {term:"subsequently",meaning:"随后",source_quote:"subsequently",why:"较正式的时间衔接副词",confidence:.95},
      {term:"REIMBURSEMENT",meaning:"报销",source_quote:"REIMBURSEMENT",why:"差旅和财务场景高频词",confidence:.95},
      {term:"deadline",meaning:"截止日期",source_quote:"deadl1ne @#$",why:"项目管理中的高频职场词",confidence:.95}
    ]
  },2,item,item,[item]);
  assert.equal(rejected,undefined);
});

test("strict validator allows absence but rejects malformed present knowledge",()=>{
  assert.deepEqual(knowledgeValidationErrors(undefined,7,materialGroup.items[0],materialGroup,materialGroup.items),[]);
  const normalized=normalizeKnowledgeV2(contextualKnowledge,3,materialGroup.items[0],materialGroup,materialGroup.items);
  assert.deepEqual(knowledgeValidationErrors(normalized,3,materialGroup.items[0],materialGroup,materialGroup.items),[]);
  assert.ok(knowledgeValidationErrors({...normalized,source_fields:["answer_explain"]},3,materialGroup.items[0],materialGroup,materialGroup.items).length);
});

test("material knowledge is designed for one detail-level copy, not every question",()=>{
  const normalized=normalizeKnowledgeV2(contextualKnowledge,3,materialGroup.items[0],materialGroup,materialGroup.items);
  const detail={knowledge_accumulation:normalized,items:materialGroup.items.map(item=>({...item}))};
  assert.ok(detail.knowledge_accumulation);
  assert.ok(detail.items.every(item=>item.knowledge_accumulation===undefined));
});

test("rejects easy headwords, temporary phrases and truncated OCR evidence",()=>{
  const group={transcript:"The location is perfect. Please submit the reimbursement request before Friday.",items:[{question:"What should be submitted?",choices:["A request","A résumé"]}]};
  const raw={source_scope:"material",vocabulary:[
    {term:"location",meaning:"地点",source_quote:"The location is perfect.",why:"用于说明地点",confidence:.99},
    {term:"reimbursement",meaning:"报销",source_quote:"submit the reimbursement request",why:"财务流程中的专业词",confidence:.93}
  ],collocations:[
    {phrase:"look at my car",meaning:"看我的汽车",source_quote:"look at my car",why:"当前对话中的描述",confidence:.98},
    {phrase:"submit the reimbursement request",meaning:"提交报销申请",source_quote:"Please submit the reimbursement request before Friday.",why:"行政和财务通知中的可迁移表达",confidence:.94}
  ]};
  const value=normalizeKnowledgeV2(raw,3,group.items[0],group,group.items);
  assert.deepEqual(value.vocabulary.map(entry=>entry.term),["reimbursement"]);
  assert.deepEqual(value.collocations.map(entry=>entry.phrase),["submit the reimbursement request"]);
  const noisy={...raw,vocabulary:[{term:"reimbursement",meaning:"报销",source_quote:"reimbursement Iu",why:"财务流程中的专业词",confidence:.99}],collocations:[]};
  assert.equal(normalizeKnowledgeV2(noisy,3,group.items[0],group,group.items),undefined);
});
