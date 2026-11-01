# Agents for the Manager Review Desk

Start these from this folder (workspace "ManagerReviewDesk"):
- desk-reviewer: reviews answers you submit, writes the result on the page, notifies the Tether Lead when an answer must be acted on.
- desk-curator: keeps the item list current from the Tether registers.
- desk-security-reviewer, desk-legal-reviewer and desk-technical-reviewer: thin, read-only specialists the desk-reviewer escalates to (deviating answers, CRITICAL/HIGH items, wrong assumptions). Research support only, never legal advice, never close a finding or gate.

They talk to the Tether project agents through the linked workspace "AIStudentNotesApp". Answers are only picked up while a desk-reviewer is running (ask it to keep watching).
