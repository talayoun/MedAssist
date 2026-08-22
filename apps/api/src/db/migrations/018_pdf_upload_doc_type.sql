-- Allow patient-uploaded PDFs alongside images and staff-signature PNGs
ALTER TABLE patient_documents DROP CONSTRAINT patient_documents_doc_type_check;
ALTER TABLE patient_documents ADD CONSTRAINT patient_documents_doc_type_check
  CHECK (doc_type IN ('image_upload', 'signature', 'pdf_upload'));
