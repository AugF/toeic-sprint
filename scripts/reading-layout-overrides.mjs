import fs from "node:fs";
import path from "node:path";

/**
 * Image-verified corrections for the small set of Part 6/7 question blocks
 * that remain ambiguous after column OCR. Every entry names the exact source
 * scan used for visual transcription. Do not add an entry without checking
 * the printed question number and all four choices on that image.
 */
export const READING_ITEM_OVERRIDES = new Map(Object.entries({
  "official-1-test-2/p6-143-146/146": {
    source_image: "official-1-test-2/images/part6/q143-146.jpg",
    choices: [
      "In fact, more bicycle safety courses should be provided.",
      "In addition, new bicycle shops have been opened.",
      "In other words, riding a bicycle is good exercise.",
      "Indeed, I feel that more bicycle lanes should follow."
    ]
  },
  "official-1-test-2/p6-135-138/136": {
    source_image: "official-1-test-2/images/part6/q135-138.jpg",
    choices: [
      "Our new entry-level vehicle is also very popular.",
      "In addition, she earns an annual bonus that is higher than average.",
      "Likewise, she works well under pressure.",
      "I will be happy to offer her a position with our company."
    ]
  },
  "official-2-test-1/p6-143-146/144": {
    source_image: "official-2-test-1/images/part6/q143-146.jpg",
    choices: [
      "Last March we had more than 200 attendees.",
      "Let me know if you will be able to attend.",
      "Tickets are available online.",
      "Interviews will be held in Miami."
    ]
  },
  "official-2-test-1/p6-143-146/145": {
    source_image: "official-2-test-1/images/part6/q143-146.jpg",
    choices: ["students", "members", "patients", "salespeople"]
  },
  "official-2-test-1/p6-143-146/146": {
    source_image: "official-2-test-1/images/part6/q143-146.jpg",
    choices: ["were taking place", "took place", "takes place", "will take place"]
  },
  "official-3-test-1/p6-143-146/145": {
    source_image: "official-3-test-1/images/part6/q143-146.jpg",
    choices: ["The total cost is still not known.", "The hours of operation are subject to change.", "Sales are expected to increase steadily.", "The work will be done in several stages."]
  },
  "official-3-test-1/p6-143-146/146": {
    source_image: "official-3-test-1/images/part6/q143-146.jpg",
    choices: ["essential", "temporary", "expensive", "unexpected"]
  },
  "official-3-test-2/p6-143-146/143": {
    source_image: "official-3-test-2/images/part6/q143-146.jpg",
    choices: ["Instead", "Otherwise", "In the meantime", "As a rule"]
  },
  "official-3-test-2/p6-143-146/144": {
    source_image: "official-3-test-2/images/part6/q143-146.jpg",
    choices: ["They have undergone additional training.", "It has been interesting to see the results.", "The benefits of this are unclear.", "People will be more likely to comply."]
  },
  "official-3-test-2/p6-143-146/145": {
    source_image: "official-3-test-2/images/part6/q143-146.jpg",
    choices: ["urgent", "amusing", "convenient", "ordinary"]
  },
  "official-3-test-2/p6-143-146/146": {
    source_image: "official-3-test-2/images/part6/q143-146.jpg",
    choices: ["realized", "will realize", "would have realized", "been realizing"]
  },
  "official-4-test-1/p6-139-142/140": {
    source_image: "official-4-test-1/images/part6/q139-142.jpg",
    choices: ["This ensures that you have a happy experience with us.", "If you need to change this date, please let us know.", "It is important that you select your start date as soon as possible.", "We will be able to adjust your compensation if you would like."]
  },
  "official-4-test-1/p6-139-142/141": {
    source_image: "official-4-test-1/images/part6/q139-142.jpg",
    choices: ["mine", "yours", "my", "her"]
  },
  "official-4-test-1/p6-139-142/142": {
    source_image: "official-4-test-1/images/part6/q139-142.jpg",
    choices: ["Generously", "Appropriately", "Personally", "Alternatively"]
  },
  "official-4-test-2/p6-135-138/136": {
    source_image: "official-4-test-2/images/part6/q135-138.jpg",
    choices: [
      "It is an excellent mentorship program.",
      "Let me know if the contract can be signed this week.",
      "Since then he has sold more than 30 properties.",
      "There was additional space for storage."
    ]
  },
  "official-4-test-2/p6-131-134/133": {
    source_image: "official-4-test-2/images/part6/q131-134.jpg",
    choices: [
      "The center is offering cycling classes this month.",
      "The bicycle ride last year was canceled.",
      "The town is planning to install bicycle paths soon.",
      "All bicycles will probably be claimed quickly."
    ]
  },
  "official-4-test-2/p6-143-146/146": {
    source_image: "official-4-test-2/images/part6/q143-146.jpg",
    choices: [
      "On this date, all travel alerts can be removed.",
      "I have already been notified about alerts for these countries.",
      "The alert for Monrovia should therefore last until the morning of 5 November.",
      "I will need an alert on my account for all of these countries."
    ]
  },
  "official-5-test-2/p6-131-134/132": {
    source_image: "official-5-test-2/images/part6/q131-134.jpg",
    choices: ["Rental applications are available at www.LeeRealty.ca.", "Lee Realty expects to spend $3.5 million on renovations.", "The number of unoccupied units has decreased recently.", "There are several parks and recreation centers nearby."]
  },
  "official-5-test-2/p6-131-134/133": {
    source_image: "official-5-test-2/images/part6/q131-134.jpg",
    choices: ["properties", "improvements", "procedures", "utensils"]
  },
  "official-5-test-2/p6-131-134/134": {
    source_image: "official-5-test-2/images/part6/q131-134.jpg",
    choices: ["provided", "was providing", "has been providing", "will provide"]
  },
  "official-5-test-2/p6-135-138/137": {
    source_image: "official-5-test-2/images/part6/q135-138.jpg",
    choices: ["Wednesday shifts are usually the most popular option.", "The shifts will take place when the restaurant is closed.", "Servers who prefer to skip the cleaning shifts should file a written request.", "Extended cleaning shifts are available every day of the week."]
  },
  "official-6-test-1/p6-135-138/136": {
    source_image: "official-6-test-1/images/part6/q135-138.jpg",
    choices: ["Peggie's is proud to use ingredients from these local areas.", "Last year Peggie's outperformed every other Australian pizza chain.", "Australians have shown a newfound love for food from this part of the world.", "Peggie's is excited to open its second Australian franchise soon."]
  },
  "official-6-test-1/p6-135-138/137": {
    source_image: "official-6-test-1/images/part6/q135-138.jpg",
    choices: ["he", "him", "his", "himself"]
  },
  "official-6-test-1/p6-135-138/138": {
    source_image: "official-6-test-1/images/part6/q135-138.jpg",
    choices: ["supposed", "remembered", "concerned", "aspired"]
  },
  "official-6-test-1/p6-139-142/139": {
    source_image: "official-6-test-1/images/part6/q139-142.jpg",
    choices: ["generous", "growing", "guaranteed", "gradual"]
  },
  "official-6-test-1/p6-139-142/140": {
    source_image: "official-6-test-1/images/part6/q139-142.jpg",
    choices: ["It will save your company time and expenses.", "She has a full schedule on those days.", "We have offices in twelve locations.", "The meeting would take a half hour."]
  },
  "official-6-test-1/p6-139-142/141": {
    source_image: "official-6-test-1/images/part6/q139-142.jpg",
    choices: ["Although", "Instead", "Otherwise", "Also"]
  },
  "official-6-test-1/p6-139-142/142": {
    source_image: "official-6-test-1/images/part6/q139-142.jpg",
    choices: ["her", "me", "you", "them"]
  },
  "official-6-test-1/p6-143-146/144": {
    source_image: "official-6-test-1/images/part6/q143-146.jpg",
    choices: ["This also serves to keep personal items secure in the office environment.", "Lunch can also be purchased from food trucks near the office.", "All bags are screened by security staff as employees enter and leave.", "These rules will be posted online as well as in the employee lounge."]
  },
  "official-6-test-1/p6-143-146/145": {
    source_image: "official-6-test-1/images/part6/q143-146.jpg",
    choices: ["dropped off", "set up", "taken apart", "put away"]
  },
  "official-6-test-1/p6-143-146/146": {
    source_image: "official-6-test-1/images/part6/q143-146.jpg",
    choices: ["supervise", "supervisor", "supervisory", "supervision"]
  },
  "official-6-test-2/p6-135-138/136": {
    source_image: "official-6-test-2/images/part6/q135-138.jpg",
    choices: ["Please let me know if this is acceptable to you.", "Instead, a list of speakers is included with this letter.", "For this reason, the association's membership fees have increased.", "You should be prepared to join us here next week."]
  },
  "official-7-test-2/p6-135-138/137": {
    source_image: "official-7-test-2/images/part6/q135-138.jpg",
    choices: ["This was a great choice for a home loan.", "Feel free to take a test drive at any time.", "However, you will still need to purchase an auto insurance policy.", "We can do this because we specialize in low-interest auto loans."]
  },
  "official-8-test-2/p6-135-138/136": {
    source_image: "official-8-test-2/images/part6/q135-138.jpg",
    choices: [
      "Those with offices on these floors may request temporary office relocation.",
      "The maintenance crews will work only after all offices close for the day.",
      "The dates of this project have not yet been decided upon.",
      "Disruptions, including noise and dust, have already caused delays."
    ]
  },
  "official-8-test-2/p6-143-146/145": {
    source_image: "official-8-test-2/images/part6/q143-146.jpg",
    choices: [
      "The next project involves the installation of new digital locks on the front doors.",
      "Community members are invited to the reopening ceremony next weekend.",
      "No vehicles may be parked in the 1520 Elm Street garage during this time.",
      "There will be more noise outside than usual due to ongoing work."
    ]
  },
  "official-9-test-2/p6-143-146/143": {
    source_image: "official-9-test-2/images/part6/q143-146.jpg",
    choices: ["Its exclusive music-related audio channels are very popular.", "The app is already installed on many top-rated smart televisions.", "It will feature short content that is formatted for mobile phones.", "Laurelhurst is known primarily for its child-friendly educational materials."]
  },
  "official-9-test-2/p6-143-146/146": {
    source_image: "official-9-test-2/images/part6/q143-146.jpg",
    choices: ["created", "creative", "creativity", "creatively"]
  },
  "official-10-test-1/p6-139-142/139": {
    source_image: "official-10-test-1/images/part6/q139-142.jpg",
    choices: ["statue", "structure", "sign", "hill"]
  },
  "official-10-test-1/p6-139-142/140": {
    source_image: "official-10-test-1/images/part6/q139-142.jpg",
    choices: ["The Pink Pyramid, as it is often called, is home to the city's Central Library.", "His custom-designed homes can be seen throughout Finland.", "Dahlberg is located on a thin strip of land between two lakes.", "Mr. Tuokkola never achieved the fame of some other Finnish architects."]
  },
  "official-10-test-1/p6-143-146/145": {
    source_image: "official-10-test-1/images/part6/q143-146.jpg",
    choices: ["Bishop Technology plans to close several facilities worldwide.", "Ms. Hyeon greatly expanded Bishop Technology's market share in her area.", "Bishop Technology plans to interview Ms. Hyeon.", "The two companies once considered forming a partnership."]
  },
  "official-11-test-2/p6-139-142/141": {
    source_image: "official-11-test-2/images/part6/q139-142.jpg",
    choices: ["You can pick up your files any time before Thursday.", "Call our customer service department to expedite your order.", "You need to enter the code before the screening begins.", "Films are a source of entertainment as well as information."]
  },
  "official-11-test-2/p6-143-146/145": {
    source_image: "official-11-test-2/images/part6/q143-146.jpg",
    choices: ["A trail map is recommended.", "We can supply them if needed.", "This practice applies to businesses too.", "It depends on the particular species."]
  },
  "official-9-test-1/p6-135-138/137": {
    source_image: "official-9-test-1/images/part6/q135-138.jpg",
    choices: [
      "I will return your call as soon as possible.",
      "The discount expires on November 1.",
      "Any difference will be credited toward your bill.",
      "The contract for the new policy is in the mail."
    ]
  },
  "official-12-test-1/p6-135-138/136": {
    source_image: "official-12-test-1/images/part6/q135-138.jpg",
    choices: [
      "We want staff to be healthier and more active at work.",
      "More research on these desks needs to be conducted.",
      "Employees have access to many health care options.",
      "Standing desks are more expensive than we anticipated."
    ]
  },
  "official-2-test-2/p7-196-200/196": {
    source_image: "official-2-test-2/images/part7/q196-200-p2.jpg",
    question: "What does Dr. Scheffner mention about Dermava?",
    choices: ["It works very quickly.", "It should be used twice a day.", "It is surprisingly inexpensive.", "It can be used for up to three days."]
  },
  "official-2-test-2/p7-196-200/197": {
    source_image: "official-2-test-2/images/part7/q196-200-p2.jpg",
    question: "According to the article, what does Ricoeur Pharmaceuticals plan to do?",
    choices: ["Develop safer creams", "Conduct additional research", "Compensate the study participants", "Review the production schedule"]
  },
  "official-2-test-2/p7-196-200/198": {
    source_image: "official-2-test-2/images/part7/q196-200-p2.jpg",
    question: "What is implied about Ricoeur Pharmaceuticals?",
    choices: ["Its production facility is located in France.", "Its laboratories will be inspected in October.", "Its latest medication has been approved by the IMA.", "Its products have gained in popularity during the past five years."]
  },
  "official-2-test-2/p7-196-200/199": {
    source_image: "official-2-test-2/images/part7/q196-200-p2.jpg",
    question: "What is indicated by the advertisement?",
    choices: ["Applicants should have previous work experience.", "Group interviews will be held over several days.", "The application process is very time-consuming.", "The available positions are temporary."]
  },
  "official-2-test-2/p7-196-200/200": {
    source_image: "official-2-test-2/images/part7/q196-200-p2.jpg",
    question: "For what job was Ms. Jordan most likely hired?",
    choices: ["An administrative job", "A customer service job", "A research job", "A warehouse job"]
  },
  "official-4-test-2/p7-186-190/190": {
    source_image: "official-4-test-2/images/part7/q186-190-p2.jpg",
    question: "How much will Bosen Corporation receive from Velmanix, Inc.?",
    choices: ["$140.00", "$240.00", "$400.00", "$475.00"]
  },
  "official-12-test-2/p7-176-180/176": {
    source_image: "official-12-test-2/images/part7/q176-180-p2.jpg",
    question: "What is one purpose of the e-mail?",
    choices: ["To request receipts from conference speakers", "To ask Dr. Aoki about a schedule change", "To inform Dr. Aoki about a set of hotel reservations", "To confirm the topic of a conference"]
  },
  "official-12-test-2/p7-176-180/179": {
    source_image: "official-12-test-2/images/part7/q176-180-p2.jpg",
    question: "What is indicated about Dr. Riggs?",
    choices: ["She arrived in Yorkbridge on Tuesday.", "She shared a room with Ms. Min.", "She was invited to apply for a job at Scarlet State University.", "She spoke to a group of students at Scarlet State University."]
  }
}));

export function verifyReadingItemOverrides(scanRoot) {
  const failures=[];
  for(const [key,value] of READING_ITEM_OVERRIDES){
    if(!value.source_image)failures.push(`${key}: missing source_image`);
    else if(!fs.existsSync(path.join(scanRoot,...value.source_image.split("/"))))failures.push(`${key}: source image not found`);
    if(!Array.isArray(value.choices)||value.choices.length!==4||value.choices.some(choice=>!choice?.trim()))failures.push(`${key}: choices must contain A-D`);
  }
  return failures;
}
