# Arquitetura — documentos de admissão (privado)

## Objetivo
Armazenar anexos do checklist (modalidade→documentos→secretaria→pastor) **sem** exposição pública e **sem** dados reais nesta fase.

## Modelo
Tabela `admission_documents` (metadados): `displayName`, `contentType`, `byteSize`, `storageKey`, `uploadedByUserId`.  
Bytes **fora** do Postgres em `STORAGE_ROOT` (local DEV/HML).

## Controle de acesso
| Ação | Papéis |
|------|--------|
| Upload | SECRETARIA / PLATFORM_ADMIN |
| Listar metadados | SECRETARIA / PASTOR / PLATFORM_ADMIN |
| Download | SECRETARIA / PASTOR / PLATFORM_ADMIN |
| MEMBRO | sem acesso |

Auditoria: `admission_document.upload|download` com `sha256` (sem bytes / sem path bruto).

## Tipos
PDF, JPEG, PNG · máximo 5 MiB · multipart campo `file`.

## Evolução (aprovação)
1. Bucket S3-compat privado + URL assinada curta  
2. Antivírus / clamd opcional  
3. Retenção LGPD / purge pós-aprovação  

Implementação atual: `PrivateStorageService` + endpoints em `/admissions/:id/documents`.
