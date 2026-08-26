import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mergeTranscriptChunks,parsePart1,parsePart2,parsePart34,sentenceLines,validatePublishedTranscript} from "../scripts/rebuild-listening-transcripts.mjs";
import {isCurrentTranslation,validateTranslation} from "../scripts/translate-listening-transcripts-ollama.mjs";
import {cleanupObvious,suspiciousChoice,suspiciousQuestion} from "../scripts/repair-listening-items-ollama.mjs";

test("Part 1 removes the spoken direction and emits exactly four choices",()=>{
  const value=parsePart1("Number 3. Look at the picture marked number 3 in your test book. A. A man is filing documents. B. A box is on the desk. C. A woman is holding a phone. D. A woman is using a mouse. Go on to the next page. Between Between Between.",3);
  assert.deepEqual(value.split("\n"),["A. A man is filing documents.","B. A box is on the desk.","C. A woman is holding a phone.","D. A woman is using a mouse."]);
});

test("Part 1 accepts a spoken number word",()=>{
  const value=parsePart1("Number four. Look at the picture marked number four in your test book. A. A board is being erased. B. People are attending a presentation. C. A man is standing in a doorway. D. All seats are occupied.",4);
  assert.equal(value.split("\n").length,4);
});

test("Part 1 tolerates a clipped direction and ignores the next question cue",()=>{
  const value=parsePart1("One in your test book. A. She's picking up a coffee mug. B. She's paying for a pair of jeans. C. She's searching through a shopping bag. D. She's holding up an item of clothing. Number two. Look at the picture.",1);
  assert.equal(value.split("\n").length,4);
  assert.match(value,/^D\. She's holding up an item of clothing\.$/m);
});

test("Part 2 rebuilds the prompt and all three spoken responses",()=>{
  const value=parsePart2("Number 10. Did you enjoy the dance performance last night? A. A ballet company from Argentina. B. Yes, it was better than expected. C. A few more nights.",10);
  assert.equal(value,"Did you enjoy the dance performance last night?\nA. A ballet company from Argentina.\nB. Yes, it was better than expected.\nC. A few more nights.");
});

test("Part 2 accepts ASR labels without punctuation",()=>{
  const value=parsePart2("number 23 where did you find that lovely coat a thank you it was a gift B every January C no I have not found them",23);
  assert.equal(value,"where did you find that lovely coat\nA. thank you it was a gift\nB. every January\nC. no I have not found them");
});

test("Part 2 does not confuse an article with choice A and accepts numeric responses",()=>{
  const value=parsePart2("Number 22. There's a helpful diagram on page 57. A. 125. B. Mr. Evans did. C. Okay, I'll take a look.",22);
  assert.match(value,/^There's a helpful diagram on page 57\.$/m);
  assert.match(value,/^A\. 125\.$/m);
});

test("Part 2 can recover a clipped number cue and ASR homophone for C",()=>{
  const value=parsePart2("You didn't leave your mobile phone on the train, did you? a it's 555-0126. B a ticket to Amsterdam. see no, I have it right here.",19);
  assert.match(value,/^C\. no, I have it right here\.$/m);
});

test("Part 2 refuses a mismatched spoken number",()=>{
  assert.throws(()=>parsePart2("Number 11. Where is it? A. Here. B. There. C. Outside.",10),/Number 10/);
});

test("Part 3 removes only the official spoken introduction",()=>{
  const raw="Questions 44 through 46 refer to the following conversation. Excuse me, my phone has been very slow. Sometimes it loses calls. I would like a new phone. We have several models on display. Some are available at half price. These smartphones have web browsing and road navigation. Let me show you how they work.";
  const value=parsePart34(raw,3,44,46,"Excuse me my phone has been slow and sometimes loses calls. We have models on display at half price. These smartphones have web browsing and navigation.");
  assert.ok(value.transcript.startsWith("Excuse me"));
  assert.ok(!value.transcript.includes("Questions 44"));
  assert.ok(value.transcript.includes("\n"));
});

test("overlapping audio windows are merged without repeating their shared words",()=>{
  const merged=mergeTranscriptChunks(["The order will arrive tomorrow morning. Please call us by five.","Please call us by five. We can deliver the dining set tomorrow."]);
  assert.equal(merged,"The order will arrive tomorrow morning. Please call us by five. We can deliver the dining set tomorrow.");
});

test("Part 4 accepts the official material type spoken in its introduction",()=>{
  const raw="Questions 71 through 73 refer to the following telephone message. Hello, this is Ricardo from Wagner Home Furnishings. We made a mistake when entering your delivery address. Please call us with the correct address before five this afternoon. The truck will leave tomorrow morning and can deliver the dining set tomorrow.";
  const value=parsePart34(raw,4,71,73,"Hello this is Ricardo from home furnishings. We made a mistake entering the delivery address. Please call with the correct address before five. The truck leaves tomorrow morning.");
  assert.ok(value.transcript.startsWith("Hello"));
});

test("Part 4 accepts instructions, broadcast, and a clipped Questions token",()=>{
  const value=parsePart34("71 through 73 refer to the following broadcast. I'm reporting live from the museum. A new exhibit has opened on the first floor. Visitors can explore outer space in a simulated rocket ship. The experience continues around several planets.",4,71,73,"");
  assert.match(value.transcript,/^I'm reporting live from the museum\./);
});

test("Part 3 accepts a short ASR artifact before an exact question range",()=>{
  const value=parsePart34("In 62 through 64, refer to the following conversation and sign. Good afternoon. I need a certified copy of my birth certificate. We can prepare that for you next week. Please call ahead before you return to pick it up.",3,62,64,"");
  assert.match(value.transcript,/^Good afternoon\./);
});

test("sentence formatting keeps time and title abbreviations intact",()=>{
  assert.equal(sentenceLines("I'll be there at 2 p.m. The usual room, right? Ask Mr. Jones."),"I'll be there at 2 p.m.\nThe usual room, right?\nAsk Mr. Jones.");
});

test("sentence formatting removes a detached graphic reference and repairs spaced domains",()=>{
  assert.equal(sentenceLines("and seating chart. Please visit www. example. com today. The schedule is available there."),"Please visit www.example.com today.\nThe schedule is available there.");
});

test("deterministic item cleanup repairs joined articles without changing real A-words",()=>{
  assert.equal(cleanupObvious("Aregional manager"),"A regional manager");
  assert.equal(cleanupObvious("Ata hotel"),"At a hotel");
  assert.equal(cleanupObvious("Asking for assistance"),"Asking for assistance");
  assert.equal(suspiciousChoice(cleanupObvious("Aregional manager")),false);
});

test("item cleanup removes a trailing adjacent question number",()=>{
  const value=cleanupObvious("What type of business is being advertised? 77.",{question:true});
  assert.equal(value,"What type of business is being advertised?");
  assert.equal(suspiciousQuestion(value),false);
});

test("Part 3 rejects a transcript containing navigation residue",()=>{
  const raw="Questions 44 through 46 refer to the following conversation. This is a sufficiently long workplace conversation with enough words to pass a basic duration check. The speakers discuss a customer order, a delivery schedule, and an updated address in several complete sentences. Go on to the next page.";
  assert.throws(()=>parsePart34(raw,3,44,46,""),/navigation/);
});

test("Part 3 rejects silence hallucinations with repeated words",()=>{
  const raw="Questions 44 through 46 refer to the following conversation. This workplace conversation contains enough normal words to pass the length gate before silence begins. The speakers discuss a delivery schedule and customer address. Between between between between between between between between between between.";
  assert.throws(()=>parsePart34(raw,3,44,46,""),/repetition/);
});

test("published transcript rejects repeated two-word hallucination loops",()=>{
  const transcript=`What's important here, ${"don't you ".repeat(30)}`;
  const detail={part:4,context:{transcript,transcript_source:{schema_version:"listening_transcript_v2"}}};
  assert.throws(()=>validatePublishedTranscript(detail),/unsafe listening transcript/);
});

test("published transcript requires audio provenance",()=>{
  const detail={part:2,context:{transcript:"Where is the meeting?\nA. Upstairs.\nB. At noon.\nC. With Jane.",transcript_source:{schema_version:"listening_transcript_v2"}}};
  assert.equal(validatePublishedTranscript(detail),true);
  assert.throws(()=>validatePublishedTranscript({...detail,context:{...detail.context,transcript_source:undefined}}),/provenance/);
});

test("translation keeps one aligned line and the same option label",()=>{
  assert.deepEqual(validateTranslation("Where is the meeting?\nA. On the second floor.",["会议在哪里？","A. 在二楼。"]),["会议在哪里？","A. 在二楼。"]) 
  assert.throws(()=>validateTranslation("A. On the second floor.",["B. 在二楼。"]),/lost option label/);
});

test("Part 3 translation may naturally merge adjacent transcript sentences",()=>{
  const lines=validateTranslation("Welcome to the office.\nYour orientation starts upstairs.",["欢迎来到办公室，入职培训在楼上开始。"],3);
  assert.deepEqual(lines,["欢迎来到办公室，入职培训在楼上开始。"]);
});

test("translation provenance becomes stale when English changes",()=>{
  const detail={context:{transcript:"Hello.",transcript_translation:"你好。",transcript_translation_source:{schema_version:"listening_translation_v2",transcript_sha256:"wrong"}}};
  assert.equal(isCurrentTranslation(detail),false);
});

test("translation provenance alone cannot bless untranslated English",()=>{
  const transcript="Hello, this is a test message.";
  const detail={part:4,context:{
    transcript,
    transcript_translation:transcript,
    transcript_translation_source:{
      schema_version:"listening_translation_v2",
      transcript_sha256:createHash("sha256").update(transcript).digest("hex"),
    },
  }};
  assert.equal(isCurrentTranslation(detail),false);
});
