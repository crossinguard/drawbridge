/**
 * Builds the cartridges the bundle tests run against.
 *
 * The real course exports in `reference/canvas/course/` are git-ignored, and
 * they do not hold every case the bundle has to handle. This cartridge holds
 * the ones that matter:
 *
 * - an assignment placed in two modules, which has to be counted once;
 * - a graded discussion, which has to appear in the assessments and the
 *   group totals;
 * - thirty quizzes, fourteen of which are set up exactly the same way;
 * - boilerplate instructions shared by eight quizzes;
 * - two question banks, one of which a quiz really does draw from;
 * - instructions that ask for six to eight pages against a rubric that allows
 *   five pages or less.
 */
import JSZip from "jszip";

/** The number of quizzes in the fixture. */
export const QUIZ_COUNT = 30;

/** How many of the quizzes are set up the same way. */
export const IDENTICAL_QUIZZES = 14;

/** How many quizzes share the boilerplate instructions. */
export const BOILERPLATE_QUIZZES = 8;

/** The course settings. */
const COURSE_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="g_course" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Review Fixture (2027-1)</title>
  <course_code>FIXTURE</course_code>
  <group_weighting_scheme>percent</group_weighting_scheme>
</course>
`;

/** The course context. */
const CONTEXT = `<?xml version="1.0" encoding="UTF-8"?>
<context_info xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <course_name>Review Fixture (2027-1)</course_name>
  <root_account_name>Fixture District</root_account_name>
  <canvas_domain>canvas.example.edu</canvas_domain>
</context_info>
`;

/** The assignment groups. */
const ASSIGNMENT_GROUPS = `<?xml version="1.0" encoding="UTF-8"?>
<assignmentGroups xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <assignmentGroup identifier="g_group_assignments">
    <title>Assignments</title>
    <position>1</position>
    <group_weight>60.0</group_weight>
  </assignmentGroup>
  <assignmentGroup identifier="g_group_quizzes">
    <title>Quizzes</title>
    <position>2</position>
    <group_weight>40.0</group_weight>
  </assignmentGroup>
</assignmentGroups>
`;

/** The files metadata. */
const FILES_META = `<?xml version="1.0" encoding="UTF-8"?>
<fileMeta xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <folders/>
  <files/>
</fileMeta>
`;

/** The rubric with the length band that disagrees with the instructions. */
const RUBRICS = `<?xml version="1.0" encoding="UTF-8"?>
<rubrics xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <rubric identifier="g_rubric_length">
    <read_only>false</read_only>
    <title>Essay Rubric</title>
    <reusable>false</reusable>
    <public>false</public>
    <points_possible>25.0</points_possible>
    <hide_score_total>false</hide_score_total>
    <free_form_criterion_comments>false</free_form_criterion_comments>
    <rating_order>descending</rating_order>
    <criteria>
      <criterion>
        <criterion_id>_1</criterion_id>
        <points>25.0</points>
        <description>Length</description>
        <long_description>The essay is the length the instructions ask for.</long_description>
        <criterion_use_range>false</criterion_use_range>
        <ratings>
          <rating>
            <id>_11</id>
            <description>5 pages or less</description>
            <long_description>The essay is 5 pages or less.</long_description>
            <points>25.0</points>
          </rating>
          <rating>
            <id>_12</id>
            <description>Under 5 pages</description>
            <long_description>The essay is under 5 pages.</long_description>
            <points>10.0</points>
          </rating>
        </ratings>
      </criterion>
    </criteria>
  </rubric>
</rubrics>
`;

/** The assignment that asks for six to eight pages. */
const RANGE_ASSIGNMENT_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="g_range_assignment" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Range Assignment</title>
  <due_at>2027-03-01T05:59:00</due_at>
  <module_locked>false</module_locked>
  <assignment_group_identifierref>g_group_assignments</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <rubric_identifierref>g_rubric_length</rubric_identifierref>
  <rubric_use_for_grading>true</rubric_use_for_grading>
  <points_possible>25.0</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_upload</submission_types>
  <omit_from_final_grade>false</omit_from_final_grade>
  <hide_in_gradebook>false</hide_in_gradebook>
</assignment>
`;

/** The instructions of the assignment that asks for six to eight pages. */
const RANGE_ASSIGNMENT_BODY = `<html>
  <head><title>Assignment: Range Assignment</title></head>
  <body>
    <h2>Range Assignment</h2>
    <ul>
      <li>Write an essay of 6-8 pages in length.</li>
      <li>Use 3 sources, each cited in APA style.</li>
    </ul>
  </body>
</html>
`;

/** The graded discussion's assignment block. */
const DISCUSSION_ASSIGNMENT_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="g_discussion_1_assignment" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Graded Discussion</title>
  <due_at>2027-03-04T05:59:00</due_at>
  <module_locked>false</module_locked>
  <assignment_group_identifierref>g_group_assignments</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <points_possible>15.0</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_text_entry</submission_types>
  <omit_from_final_grade>false</omit_from_final_grade>
  <hide_in_gradebook>false</hide_in_gradebook>
</assignment>
`;

/** The graded discussion's topic. */
const DISCUSSION_TOPIC = `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <topicMeta>
    <discussion_type>threaded</discussion_type>
    <require_initial_post>true</require_initial_post>
    <allow_rating>false</allow_rating>
    <anonymous_state>anonymous</anonymous_state>
    <workflow_state>active</workflow_state>
  </topicMeta>
  <text>&lt;p&gt;Post your reading response and reply to a classmate.&lt;/p&gt;</text>
</topic>
`;

/** The instructions eight quizzes share, as the platform escapes them. */
const BOILERPLATE_DESCRIPTION =
  "&lt;p&gt;These questions cover the reading for this week.&lt;/p&gt;" +
  "&lt;ul&gt;&lt;li&gt;Answer every question before the time runs out.&lt;/li&gt;" +
  "&lt;li&gt;You may use your notes while you answer.&lt;/li&gt;&lt;/ul&gt;";

/** The instructions the other quizzes carry. */
const QUIZ_DESCRIPTION = "&lt;p&gt;Answer every question before the time runs out.&lt;/p&gt;";

/** A quiz's settings. */
function quizSettings(
  id: string,
  title: string,
  points: number,
  timeLimit: number,
  attempts: number,
  shuffle: boolean,
  description: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" identifier="${id}">
  <title>${title}</title>
  <description>${description}</description>
  <due_at>2027-03-08T05:59:00Z</due_at>
  <shuffle_questions>${shuffle}</shuffle_questions>
  <shuffle_answers>${shuffle}</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <quiz_type>assignment</quiz_type>
  <points_possible>${points}.0</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <show_correct_answers>false</show_correct_answers>
  <time_limit>${timeLimit}</time_limit>
  <allowed_attempts>${attempts}</allowed_attempts>
  <available>true</available>
  <assignment identifier="${id}_assignment">
    <title>${title}</title>
    <workflow_state>published</workflow_state>
    <assignment_group_identifierref>g_group_quizzes</assignment_group_identifierref>
    <points_possible>${points}.0</points_possible>
    <grading_type>points</grading_type>
    <submission_types>online_quiz</submission_types>
    <omit_from_final_grade>false</omit_from_final_grade>
    <hide_in_gradebook>false</hide_in_gradebook>
  </assignment>
</quiz>
`;
}

/** A quiz's questions, drawn from a bank. */
function quizQuestions(id: string, title: string, bankId: string, drawCount: number, pointsPerItem: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="${id}" title="${title}">
    <section ident="root_section">
      <section ident="g_section_1" title="Questions">
        <selection_ordering>
          <selection>
            <sourcebank_ref>${bankId}</sourcebank_ref>
            <selection_number>${drawCount}</selection_number>
            <selection_extension>
              <points_per_item>${pointsPerItem}.0</points_per_item>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>
`;
}

/** The stub Canvas writes beside the settings. */
function quizStub(id: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="${id}" title="${title}">
    <section ident="root_section"/>
  </assessment>
</questestinterop>
`;
}

/** A question bank. */
function itemBank(id: string, title: string, itemCount: number): string {
  const items = Array.from(
    { length: itemCount },
    (_, index) => `
    <item ident="${id}_item_${index}" title="Question ${index + 1}">
      <itemmetadata>
        <qtimetadata>
          <qtimetadatafield>
            <fieldlabel>question_type</fieldlabel>
            <fieldentry>multiple_choice_question</fieldentry>
          </qtimetadatafield>
          <qtimetadatafield>
            <fieldlabel>points_possible</fieldlabel>
            <fieldentry>1.0</fieldentry>
          </qtimetadatafield>
        </qtimetadata>
      </itemmetadata>
    </item>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <objectbank ident="${id}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>${title}</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>bank_type</fieldlabel>
        <fieldentry>Course</fieldentry>
      </qtimetadatafield>
    </qtimetadata>${items}
  </objectbank>
</questestinterop>
`;
}

/** What each quiz in the fixture is called and how it is set up. */
export interface FixtureQuiz {
  id: string;
  title: string;
  points: number;
  timeLimit: number;
  attempts: number;
  shuffle: boolean;
  /** The bank the quiz draws from. */
  bankId: string;
  /** How many questions it draws. */
  drawCount: number;
  /** What each question is worth. */
  pointsPerItem: number;
  /** Whether it carries the shared boilerplate instructions. */
  boilerplate: boolean;
}

/** The quizzes the fixture holds. */
export function fixtureQuizzes(): FixtureQuiz[] {
  const quizzes: FixtureQuiz[] = [];

  // Fourteen quizzes, set up exactly the same way.
  for (let index = 1; index <= IDENTICAL_QUIZZES; index++) {
    quizzes.push({
      id: `g_quiz_webinar_${index}`,
      title: `Week ${index} Webinar Quiz`,
      points: 10,
      timeLimit: 20,
      attempts: 1,
      shuffle: true,
      bankId: "g_bank_used",
      drawCount: 10,
      pointsPerItem: 1,
      boilerplate: false,
    });
  }

  // Eight quizzes that share their instructions.
  for (let index = 1; index <= BOILERPLATE_QUIZZES; index++) {
    quizzes.push({
      id: `g_quiz_boiler_${index}`,
      title: `Boilerplate Quiz ${index}`,
      points: 10,
      timeLimit: 30,
      attempts: 1,
      shuffle: false,
      bankId: "g_bank_used",
      drawCount: 10,
      pointsPerItem: 1,
      boilerplate: true,
    });
  }

  // The rest, each a little different.
  const others = 30 - IDENTICAL_QUIZZES - BOILERPLATE_QUIZZES;
  for (let index = 1; index <= others; index++) {
    quizzes.push({
      id: `g_quiz_other_${index}`,
      title: `Checkpoint Quiz ${index}`,
      points: index % 2 === 0 ? 10 : 15,
      timeLimit: 10 + index * 5,
      attempts: index % 3 === 0 ? 3 : 1,
      shuffle: index % 2 === 0,
      bankId: "g_bank_used",
      drawCount: 10,
      pointsPerItem: index % 2 === 0 ? 1 : 1.5,
      boilerplate: false,
    });
  }

  return quizzes;
}

/** Build the fixture cartridge and return it as a ZIP archive. */
export async function buildReviewFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  const quizzes = fixtureQuizzes();

  const moduleItems: string[] = [];
  const manifestResources: string[] = [];
  const moduleMetaItems: Record<string, string[]> = { m1: [], m2: [] };

  const addModuleItem = (
    module: string,
    identifier: string,
    title: string,
    contentType: string,
    target: string,
  ): void => {
    const itemId = `${module}_item_${identifier}`;
    moduleItems.push(`        <item identifier="${itemId}" identifierref="${target}">
          <title>${title}</title>
        </item>`);
    moduleMetaItems[module].push(`      <item identifier="${itemId}">
        <content_type>${contentType}</content_type>
        <workflow_state>active</workflow_state>
        <title>${title}</title>
        <identifierref>${target}</identifierref>
        <position>${moduleMetaItems[module].length + 1}</position>
        <new_tab>false</new_tab>
        <indent>0</indent>
      </item>`);
  };

  // The assignment, in the first module.
  addModuleItem("m1", "range", "Range Assignment", "Assignment", "g_range_assignment");
  addModuleItem("m1", "discussion", "Graded Discussion", "DiscussionTopic", "g_discussion_1");

  // The same assignment again, in the second module.
  addModuleItem("m2", "range_again", "Range Assignment", "Assignment", "g_range_assignment");

  quizzes.forEach((quiz, index) => {
    const module = index % 2 === 0 ? "m1" : "m2";
    addModuleItem(module, `quiz_${index}`, quiz.title, "Quizzes::Quiz", quiz.id);
  });

  // The quiz resources.
  for (const quiz of quizzes) {
    manifestResources.push(
      `    <resource identifier="${quiz.id}" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment" href="${quiz.id}/assessment_qti.xml">
      <file href="${quiz.id}/assessment_qti.xml"/>
      <dependency identifierref="${quiz.id}_meta"/>
    </resource>
    <resource identifier="${quiz.id}_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${quiz.id}/assessment_meta.xml">
      <file href="${quiz.id}/assessment_meta.xml"/>
      <file href="non_cc_assessments/${quiz.id}.xml.qti"/>
    </resource>`,
    );

    zip.file(
      `${quiz.id}/assessment_meta.xml`,
      quizSettings(
        quiz.id,
        quiz.title,
        quiz.points,
        quiz.timeLimit,
        quiz.attempts,
        quiz.shuffle,
        quiz.boilerplate ? BOILERPLATE_DESCRIPTION : QUIZ_DESCRIPTION,
      ),
    );
    zip.file(`${quiz.id}/assessment_qti.xml`, quizStub(quiz.id, quiz.title));
    zip.file(
      `non_cc_assessments/${quiz.id}.xml.qti`,
      quizQuestions(quiz.id, quiz.title, quiz.bankId, quiz.drawCount, quiz.pointsPerItem),
    );
  }

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="review_fixture" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>Review Fixture (2027-1)</lomimscc:string></lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
${moduleItems.join("\n")}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="g_course" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="course_settings/canvas_export.txt">
      <file href="course_settings/course_settings.xml"/>
      <file href="course_settings/module_meta.xml"/>
      <file href="course_settings/assignment_groups.xml"/>
      <file href="course_settings/files_meta.xml"/>
      <file href="course_settings/context.xml"/>
      <file href="course_settings/rubrics.xml"/>
    </resource>
    <resource identifier="g_range_assignment" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_range_assignment/range-assignment.html">
      <file href="g_range_assignment/range-assignment.html"/>
      <file href="g_range_assignment/assignment_settings.xml"/>
    </resource>
    <resource identifier="g_discussion_1" type="imsdt_xmlv1p1" href="g_discussion_1.xml">
      <file href="g_discussion_1.xml"/>
      <file href="g_discussion_1/assignment_settings.xml"/>
      <dependency identifierref="g_discussion_1_meta"/>
    </resource>
    <resource identifier="g_discussion_1_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_discussion_1/topicMeta.xml">
      <file href="g_discussion_1/topicMeta.xml"/>
    </resource>
    <resource identifier="g_bank_used" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/g_bank_used.xml.qti">
      <file href="non_cc_assessments/g_bank_used.xml.qti"/>
    </resource>
    <resource identifier="g_bank_unused" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/g_bank_unused.xml.qti">
      <file href="non_cc_assessments/g_bank_unused.xml.qti"/>
    </resource>
${manifestResources.join("\n")}
  </resources>
</manifest>
`;

  const moduleMeta = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="m1">
    <title>Unit 1</title>
    <workflow_state>active</workflow_state>
    <position>1</position>
    <require_sequential_progress>false</require_sequential_progress>
    <locked>false</locked>
    <items>
${moduleMetaItems.m1.join("\n")}
    </items>
  </module>
  <module identifier="m2">
    <title>Unit 2</title>
    <workflow_state>active</workflow_state>
    <position>2</position>
    <require_sequential_progress>false</require_sequential_progress>
    <locked>false</locked>
    <items>
${moduleMetaItems.m2.join("\n")}
    </items>
  </module>
</modules>
`;

  zip.file("imsmanifest.xml", manifest);
  zip.file("course_settings/course_settings.xml", COURSE_SETTINGS);
  zip.file("course_settings/context.xml", CONTEXT);
  zip.file("course_settings/module_meta.xml", moduleMeta);
  zip.file("course_settings/assignment_groups.xml", ASSIGNMENT_GROUPS);
  zip.file("course_settings/files_meta.xml", FILES_META);
  zip.file("course_settings/rubrics.xml", RUBRICS);
  zip.file("course_settings/canvas_export.txt", "Fixture export\n");

  zip.file("g_range_assignment/assignment_settings.xml", RANGE_ASSIGNMENT_SETTINGS);
  zip.file("g_range_assignment/range-assignment.html", RANGE_ASSIGNMENT_BODY);

  zip.file("g_discussion_1.xml", DISCUSSION_TOPIC);
  zip.file("g_discussion_1/topicMeta.xml", DISCUSSION_TOPIC);
  zip.file("g_discussion_1/assignment_settings.xml", DISCUSSION_ASSIGNMENT_SETTINGS);

  zip.file("non_cc_assessments/g_bank_used.xml.qti", itemBank("g_bank_used", "Used Question Bank", 12));
  zip.file("non_cc_assessments/g_bank_unused.xml.qti", itemBank("g_bank_unused", "Unused Question Bank", 5));

  return zip.generateAsync({ type: "uint8array" });
}
