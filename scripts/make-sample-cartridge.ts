/**
 * Builds a small but complete Canvas course export, for the end-to-end test.
 *
 * The real sample export in `src/assets/reference/canvas/course/` is git-ignored, so the test
 * cannot rely on it. This cartridge has the same shape — a manifest, a
 * `course_settings` folder, a page, and an assignment — which is enough to
 * exercise the whole open → browse → audit flow.
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
    </resource>
    <resource identifier="g_assignment_1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g_assignment_1/sample-assignment.html">
      <file href="g_assignment_1/sample-assignment.html"/>
      <file href="g_assignment_1/assignment_settings.xml"/>
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
    </items>
  </module>
</modules>
`;

const ASSIGNMENT_GROUPS = `<?xml version="1.0" encoding="UTF-8"?>
<assignmentGroups xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <assignmentGroup identifier="g_group_1">
    <title>Assignments</title>
    <position>1</position>
    <group_weight>0.0</group_weight>
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

const ASSIGNMENT_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="g_assignment_1" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>Sample Assignment</title>
  <due_at/>
  <lock_at/>
  <unlock_at/>
  <module_locked>false</module_locked>
  <assignment_group_identifierref>g_group_1</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <points_possible>25.0</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_upload</submission_types>
  <peer_reviews>false</peer_reviews>
  <peer_review_count>0</peer_review_count>
</assignment>
`;

const ASSIGNMENT_BODY = `<html>
  <head><title>Assignment: Sample Assignment</title></head>
  <body>
    <h2>Sample Assignment</h2>
    <p>Complete the sample assignment before the next class.</p>
    <p><a href="https://example.edu/notes">Notes</a></p>
  </body>
</html>
`;

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
  zip.file("course_settings/canvas_export.txt", "Sample export\n");
  zip.file("g_assignment_1/assignment_settings.xml", ASSIGNMENT_SETTINGS);
  zip.file("g_assignment_1/sample-assignment.html", ASSIGNMENT_BODY);
  zip.file("wiki_content/home.html", HOME_PAGE);

  return zip.generateAsync({ type: "uint8array" });
}
