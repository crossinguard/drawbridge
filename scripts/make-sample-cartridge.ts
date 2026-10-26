/**
 * Builds a small but complete Canvas course export, for the end-to-end test.
 *
 * The real sample exports in `reference/canvas/course/` are git-ignored, so
 * the test cannot rely on them. This cartridge has the same shape — a
 * manifest, a `course_settings` folder, a page, assignments, rubrics, and
 * classic quizzes that draw from an item bank — which is enough to exercise
 * the whole open → browse → audit flow and the assessment review.
 *
 * It is built to contain the things a reviewer looks for: a rubric whose
 * total does not match the assignment it is attached to, a quiz whose
 * questions are worth less than the quiz, two rubrics that are copies of each
 * other, a rubric nothing uses, and two quizzes of the same kind with a
 * setting that differs.
 */
import JSZip from "jszip";

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="sample_cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>Sample Course</lomimscc:string></lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
        <item identifier="g_module_item_1" identifierref="g_assignment_1">
          <title>Sample Assignment</title>
        </item>
        <item identifier="g_module_item_2" identifierref="g_quiz_1">
          <title>Week 1 Sample Quiz</title>
        </item>
        <item identifier="g_module_item_3" identifierref="g_quiz_2">
          <title>Week 2 Sample Quiz</title>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="g_course" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="course_settings/canvas_export.txt">
      <file href="course_settings/course_settings.xml"/>
      <file href="course_settings/module_meta.xml"/>
      <file href="course_settings/assignment_groups.xml"/>
      <file href="course_settings/files_meta.xml"/>
      <file href="course_settings/late_policy.xml"/>
      <file href="course_settings/context.xml"/>
      <file href="course_settings/rubrics.xml"/>
    </resource>
    <resource identifier="g_assignment_1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_assignment_1/sample-assignment.html">
      <file href="g_assignment_1/sample-assignment.html"/>
      <file href="g_assignment_1/assignment_settings.xml"/>
    </resource>
    <resource identifier="g_quiz_1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment" href="g_quiz_1/assessment_qti.xml">
      <file href="g_quiz_1/assessment_qti.xml"/>
      <dependency identifierref="g_quiz_1_meta"/>
    </resource>
    <resource identifier="g_quiz_1_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_quiz_1/assessment_meta.xml">
      <file href="g_quiz_1/assessment_meta.xml"/>
      <file href="non_cc_assessments/g_quiz_1.xml.qti"/>
    </resource>
    <resource identifier="g_quiz_2" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment" href="g_quiz_2/assessment_qti.xml">
      <file href="g_quiz_2/assessment_qti.xml"/>
      <dependency identifierref="g_quiz_2_meta"/>
    </resource>
    <resource identifier="g_quiz_2_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_quiz_2/assessment_meta.xml">
      <file href="g_quiz_2/assessment_meta.xml"/>
      <file href="non_cc_assessments/g_quiz_2.xml.qti"/>
    </resource>
    <resource identifier="g_bank_1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/g_bank_1.xml.qti">
      <file href="non_cc_assessments/g_bank_1.xml.qti"/>
    </resource>
    <resource identifier="g_home_page" type="webcontent" href="wiki_content/home.html">
      <file href="wiki_content/home.html"/>
    </resource>
  </resources>
</manifest>
`;

const COURSE_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="g_course" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Sample Course</title>
  <course_code>SAMPLE</course_code>
  <group_weighting_scheme>percent</group_weighting_scheme>
  <license>private</license>
  <self_enrollment>true</self_enrollment>
  <hide_final_grade>true</hide_final_grade>
</course>
`;

const CONTEXT = `<?xml version="1.0" encoding="UTF-8"?>
<context_info xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <course_name>Sample Course</course_name>
  <root_account_name>Sample District</root_account_name>
  <canvas_domain>canvas.example.edu</canvas_domain>
</context_info>
`;

const MODULE_META = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="g_module_1">
    <title>Unit 1</title>
    <workflow_state>active</workflow_state>
    <position>1</position>
    <require_sequential_progress>false</require_sequential_progress>
    <locked>false</locked>
    <items>
      <item identifier="g_module_item_1">
        <content_type>Assignment</content_type>
        <workflow_state>active</workflow_state>
        <title>Sample Assignment</title>
        <identifierref>g_assignment_1</identifierref>
        <position>1</position>
        <new_tab>false</new_tab>
        <indent>0</indent>
      </item>
      <item identifier="g_module_item_2">
        <content_type>Quizzes::Quiz</content_type>
        <workflow_state>active</workflow_state>
        <title>Week 1 Sample Quiz</title>
        <identifierref>g_quiz_1</identifierref>
        <position>2</position>
        <new_tab>false</new_tab>
        <indent>0</indent>
      </item>
      <item identifier="g_module_item_3">
        <content_type>Quizzes::Quiz</content_type>
        <workflow_state>active</workflow_state>
        <title>Week 2 Sample Quiz</title>
        <identifierref>g_quiz_2</identifierref>
        <position>3</position>
        <new_tab>false</new_tab>
        <indent>0</indent>
      </item>
    </items>
  </module>
</modules>
`;

const ASSIGNMENT_GROUPS = `<?xml version="1.0" encoding="UTF-8"?>
<assignmentGroups xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <assignmentGroup identifier="g_group_1">
    <title>Assignments</title>
    <position>1</position>
    <group_weight>60.0</group_weight>
  </assignmentGroup>
  <assignmentGroup identifier="g_group_2">
    <title>Quizzes</title>
    <position>2</position>
    <group_weight>40.0</group_weight>
  </assignmentGroup>
</assignmentGroups>
`;

const FILES_META = `<?xml version="1.0" encoding="UTF-8"?>
<fileMeta xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <folders/>
  <files/>
</fileMeta>
`;

const LATE_POLICY = `<?xml version="1.0" encoding="UTF-8"?>
<late_policy identifier="g_late_policy" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <missing_submission_deduction_enabled>true</missing_submission_deduction_enabled>
  <missing_submission_deduction>100.0</missing_submission_deduction>
  <late_submission_deduction_enabled>true</late_submission_deduction_enabled>
  <late_submission_deduction>5.0</late_submission_deduction>
  <late_submission_interval>day</late_submission_interval>
  <late_submission_minimum_percent_enabled>true</late_submission_minimum_percent_enabled>
  <late_submission_minimum_percent>50.0</late_submission_minimum_percent>
</late_policy>
`;

/** The criteria and levels the sample rubrics share. */
const RUBRIC_CRITERIA = `
    <criteria>
      <criterion>
        <criterion_id>_1</criterion_id>
        <points>20.0</points>
        <description>Formatting and Length</description>
        <long_description>The submission follows the required format and length.</long_description>
        <criterion_use_range>false</criterion_use_range>
        <ratings>
          <rating>
            <id>_11</id>
            <description>Exemplary</description>
            <long_description>Meets all of the requirements.</long_description>
            <points>20.0</points>
          </rating>
          <rating>
            <id>_12</id>
            <description>Acceptable</description>
            <long_description>Meets some of the requirements.</long_description>
            <points>15.0</points>
          </rating>
          <rating>
            <id>_13</id>
            <description>Inadequate</description>
            <long_description>Meets few of the requirements.</long_description>
            <points>10.0</points>
          </rating>
        </ratings>
      </criterion>
      <criterion>
        <criterion_id>_2</criterion_id>
        <points>10.0</points>
        <description>Mechanics</description>
        <long_description>Spelling, punctuation, and grammar are correct.</long_description>
        <criterion_use_range>false</criterion_use_range>
        <ratings>
          <rating>
            <id>_21</id>
            <description>Exemplary</description>
            <long_description>Meets all of the requirements.</long_description>
            <points>10.0</points>
          </rating>
          <rating>
            <id>_22</id>
            <description>Acceptable</description>
            <long_description>Meets some of the requirements.</long_description>
            <points>7.0</points>
          </rating>
          <rating>
            <id>_23</id>
            <description>Inadequate</description>
            <long_description>Meets few of the requirements.</long_description>
            <points>5.0</points>
          </rating>
        </ratings>
      </criterion>
    </criteria>`;

const RUBRICS = `<?xml version="1.0" encoding="UTF-8"?>
<rubrics xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <rubric identifier="g_rubric_1">
    <read_only>false</read_only>
    <title>Sample Rubric</title>
    <reusable>false</reusable>
    <public>false</public>
    <points_possible>30.0</points_possible>
    <hide_score_total>false</hide_score_total>
    <free_form_criterion_comments>false</free_form_criterion_comments>
    <rating_order>descending</rating_order>${RUBRIC_CRITERIA}
  </rubric>
  <rubric identifier="g_rubric_2">
    <read_only>false</read_only>
    <title>Sample Rubric (copy)</title>
    <reusable>false</reusable>
    <public>false</public>
    <points_possible>30.0</points_possible>
    <hide_score_total>false</hide_score_total>
    <free_form_criterion_comments>false</free_form_criterion_comments>
    <rating_order>descending</rating_order>${RUBRIC_CRITERIA}
  </rubric>
  <rubric identifier="g_rubric_3">
    <read_only>false</read_only>
    <title>Unused Rubric</title>
    <reusable>false</reusable>
    <public>false</public>
    <points_possible>15.0</points_possible>
    <hide_score_total>false</hide_score_total>
    <free_form_criterion_comments>false</free_form_criterion_comments>
    <rating_order>descending</rating_order>
    <criteria>
      <criterion>
        <criterion_id>_9</criterion_id>
        <points>15.0</points>
        <description>Completion</description>
        <long_description>The work was completed on time.</long_description>
        <criterion_use_range>false</criterion_use_range>
        <ratings>
          <rating>
            <id>_91</id>
            <description>Complete</description>
            <long_description>Everything was submitted.</long_description>
            <points>15.0</points>
          </rating>
          <rating>
            <id>_92</id>
            <description>Incomplete</description>
            <long_description>Nothing was submitted.</long_description>
            <points>0.0</points>
          </rating>
        </ratings>
      </criterion>
    </criteria>
  </rubric>
</rubrics>
`;

const ASSIGNMENT_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="g_assignment_1" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Sample Assignment</title>
  <due_at>2027-03-01T05:59:00</due_at>
  <lock_at/>
  <unlock_at/>
  <module_locked>false</module_locked>
  <assignment_group_identifierref>g_group_1</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <rubric_identifierref>g_rubric_1</rubric_identifierref>
  <rubric_use_for_grading>true</rubric_use_for_grading>
  <rubric_hide_points>false</rubric_hide_points>
  <rubric_hide_outcome_results>false</rubric_hide_outcome_results>
  <rubric_hide_score_total>false</rubric_hide_score_total>
  <points_possible>25.0</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_upload</submission_types>
  <peer_reviews>false</peer_reviews>
  <peer_review_count>0</peer_review_count>
  <omit_from_final_grade>false</omit_from_final_grade>
  <hide_in_gradebook>false</hide_in_gradebook>
</assignment>
`;

const ASSIGNMENT_BODY = `<html>
  <head><title>Assignment: Sample Assignment</title></head>
  <body>
    <h2>Sample Assignment</h2>
    <p>Complete the sample assignment before the next class.</p>
    <ul>
      <li>Write at least 5 complete sentences.</li>
      <li>Use 3 sources, each cited in APA style.</li>
      <li>Submit a Word document of 2 pages.</li>
    </ul>
    <p><a href="https://example.edu/notes">Notes</a></p>
  </body>
</html>
`;

/** A quiz's settings file. */
function quizSettings(id: string, title: string, points: number, timeLimit: number, attempts: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" identifier="${id}">
  <title>${title}</title>
  <description>&lt;p&gt;You have ${attempts === 1 ? "only one attempt" : `${attempts} attempts`}. The time limit is ${timeLimit} minutes.&lt;/p&gt;</description>
  <due_at>2027-03-08T05:59:00Z</due_at>
  <shuffle_questions>true</shuffle_questions>
  <shuffle_answers>true</shuffle_answers>
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
    <assignment_group_identifierref>g_group_2</assignment_group_identifierref>
    <points_possible>${points}.0</points_possible>
    <grading_type>points</grading_type>
    <submission_types>online_quiz</submission_types>
    <omit_from_final_grade>false</omit_from_final_grade>
    <hide_in_gradebook>false</hide_in_gradebook>
  </assignment>
</quiz>
`;
}

/** A quiz's question file, drawing from the item bank. */
function quizQuestions(id: string, title: string, drawCount: number, pointsPerItem: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="${id}" title="${title}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>qmd_timelimit</fieldlabel>
        <fieldentry>10</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
      <section ident="g_section_1" title="Sample questions">
        <selection_ordering>
          <selection>
            <sourcebank_ref>g_bank_1</sourcebank_ref>
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

/** The item bank the quizzes draw from. */
function itemBank(): string {
  const items = Array.from(
    { length: 5 },
    (_, index) => `
    <item ident="g_bank_item_${index}" title="Question ${index + 1}">
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
  <objectbank ident="g_bank_1">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>Sample Question Bank</fieldentry>
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

const HOME_PAGE = `<html>
  <head>
    <title>Home</title>
    <meta name="front_page" content="true" />
  </head>
  <body>
    <p>Welcome to the sample course.</p>
  </body>
</html>
`;

/** Build the sample cartridge and return it as a ZIP archive. */
export async function buildSampleCartridge(): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file("imsmanifest.xml", MANIFEST);
  zip.file("course_settings/course_settings.xml", COURSE_SETTINGS);
  zip.file("course_settings/context.xml", CONTEXT);
  zip.file("course_settings/module_meta.xml", MODULE_META);
  zip.file("course_settings/assignment_groups.xml", ASSIGNMENT_GROUPS);
  zip.file("course_settings/files_meta.xml", FILES_META);
  zip.file("course_settings/late_policy.xml", LATE_POLICY);
  zip.file("course_settings/rubrics.xml", RUBRICS);
  zip.file("course_settings/canvas_export.txt", "Sample export\n");

  zip.file("g_assignment_1/assignment_settings.xml", ASSIGNMENT_SETTINGS);
  zip.file("g_assignment_1/sample-assignment.html", ASSIGNMENT_BODY);

  // The first quiz draws five questions worth one point each, but the quiz is
  // worth ten — a mismatch the review should report.
  zip.file("g_quiz_1/assessment_meta.xml", quizSettings("g_quiz_1", "Week 1 Sample Quiz", 10, 10, 1));
  zip.file("g_quiz_1/assessment_qti.xml", quizStub("g_quiz_1", "Week 1 Sample Quiz"));
  zip.file("non_cc_assessments/g_quiz_1.xml.qti", quizQuestions("g_quiz_1", "Week 1 Sample Quiz", 5, 1));

  // The second quiz draws five questions worth two points each, which is ten
  // — matching the quiz — but its time limit differs.
  zip.file("g_quiz_2/assessment_meta.xml", quizSettings("g_quiz_2", "Week 2 Sample Quiz", 10, 20, 2));
  zip.file("g_quiz_2/assessment_qti.xml", quizStub("g_quiz_2", "Week 2 Sample Quiz"));
  zip.file("non_cc_assessments/g_quiz_2.xml.qti", quizQuestions("g_quiz_2", "Week 2 Sample Quiz", 5, 2));

  zip.file("non_cc_assessments/g_bank_1.xml.qti", itemBank());

  zip.file("wiki_content/home.html", HOME_PAGE);

  return zip.generateAsync({ type: "uint8array" });
}
