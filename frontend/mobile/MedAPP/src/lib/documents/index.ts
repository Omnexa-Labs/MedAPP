// Barrel for the document export layer. Import from "@/lib/documents".
//
// The rule this layer enforces, restated because it is easy to undo one screen at
// a time: a "Download" control must produce a file that exists, and its label
// must name what that file actually is. There is no PDF generator in the project
// (see the header of saveTextDocument.ts), so today that means .txt.
export {
  saveTextDocument,
  describeSaveResult,
  DOCUMENTS_FOLDER,
  type SaveTextDocumentOptions,
  type SaveTextDocumentResult,
  type SaveTextDocumentMessage,
} from "./saveTextDocument";
export {
  buildPrescriptionDocument,
  prescriptionFileName,
  buildHealthReportDocument,
  healthReportFileName,
  formatDocumentTimestamp,
  type PrescriptionDocumentFields,
  type HealthReportFields,
  type HealthReportMetric,
  type HealthReportDose,
  type HealthReportMilestone,
  type HealthReportDevice,
} from "./builders";
