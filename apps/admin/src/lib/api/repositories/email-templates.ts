import { apiFetch } from "../client";

export interface EmailTemplate {
  key: string;
  subject: string;
  html_body: string;
  description: string | null;
  is_active: boolean;
  variables: string[];
  updated_at: string | null;
  is_custom: boolean;
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  return apiFetch<EmailTemplate[]>("/api/v1/admin/email-templates");
}

export async function getEmailTemplate(key: string): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/api/v1/admin/email-templates/${key}`);
}

export async function updateEmailTemplate(
  key: string,
  data: { subject?: string; html_body?: string },
): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/api/v1/admin/email-templates/${key}`, {
    method: "PATCH",
    body: data,
  });
}

export async function toggleEmailTemplate(key: string): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/api/v1/admin/email-templates/${key}/toggle`, {
    method: "PATCH",
  });
}

export async function previewEmailTemplate(
  key: string,
  toEmail: string,
): Promise<{ status: string }> {
  return apiFetch(`/api/v1/admin/email-templates/${key}/preview`, {
    method: "POST",
    body: { to_email: toEmail },
  });
}

export async function resetEmailTemplate(key: string): Promise<{ status: string; key: string }> {
  return apiFetch(`/api/v1/admin/email-templates/${key}/reset`, {
    method: "POST",
  });
}
