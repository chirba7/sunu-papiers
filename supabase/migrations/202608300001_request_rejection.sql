-- Motif de désapprobation d'une demande par le délégué.
alter table public.document_requests
  add column if not exists rejection_code text,
  add column if not exists rejection_reason text;

comment on column public.document_requests.rejection_code is
  'Motif normalisé du refus : incoherence | mauvaise_maison | documents_illisibles | autre.';
comment on column public.document_requests.rejection_reason is
  'Message libre rédigé par le délégué et affiché au citoyen lorsque la demande est désapprouvée.';

-- Index utilisé par le compteur de demandes du délégué (route /api/delegate/requests/summary).
create index if not exists document_requests_delegate_status_idx
  on public.document_requests (delegate_id, status);
