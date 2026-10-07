import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getSupabaseClient } from "./supabase";
import type { FeedbackCategory, FeedbackRecord } from "../../../shared/types";

export interface FeedbackInsertInput {
  id?: string;
  message: string;
  category: FeedbackCategory;
  subject?: string | null;
  rating?: number | null;
  name?: string | null;
  email?: string | null;
  enrollment?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  mailed?: boolean;
}

/**
 * Returns the path to the local backup storage file.
 */
export function getFeedbackFilePath(): string {
  if (process.env.FEEDBACK_FILE_PATH) {
    return process.env.FEEDBACK_FILE_PATH;
  }
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return path.join(dir, "data", "feedback.json");
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), "backend", "data", "feedback.json");
}

/**
 * Local file fallback persistence (ensures zero data loss if DB is unreachable).
 */
export function saveFeedbackLocally(entry: Record<string, any>): void {
  try {
    const filePath = getFeedbackFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let list: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        list = JSON.parse(content);
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
    }
    list.unshift(entry);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    // Non-fatal, do not throw
  }
}

/**
 * Retrieve feedback stored locally.
 */
export function getStoredFeedback(): any[] {
  try {
    const filePath = getFeedbackFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const list = JSON.parse(content);
      return Array.isArray(list) ? list : [];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Persists a validated feedback record to Supabase PostgreSQL,
 * with automatic fallback to local JSON file persistence.
 */
export async function saveFeedbackRecord(
  input: FeedbackInsertInput
): Promise<{ record: FeedbackRecord; storedInDb: boolean }> {
  const id = input.id || crypto.randomUUID();
  const created_at = input.created_at || new Date().toISOString();

  const record: FeedbackRecord = {
    id,
    message: input.message,
    category: input.category,
    subject: input.subject || null,
    rating: input.rating !== undefined ? input.rating : null,
    name: input.name || null,
    email: input.email || null,
    enrollment: input.enrollment || null,
    metadata: input.metadata || null,
    created_at,
  };

  let storedInDb = false;
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("feedback")
        .insert({
          id: record.id,
          message: record.message,
          category: record.category,
          subject: record.subject,
          rating: record.rating,
          name: record.name,
          email: record.email,
          enrollment: record.enrollment,
          metadata: record.metadata,
          created_at: record.created_at,
        })
        .select()
        .single();

      if (error) {
        console.error("[Feedback DB] Supabase insert failed:", error.message);
      } else {
        storedInDb = true;
        if (data?.id) {
          record.id = data.id;
        }
        if (data?.created_at) {
          record.created_at = data.created_at;
        }
      }
    } catch (err: any) {
      console.error("[Feedback DB] Supabase exception:", err.message);
    }
  }

  // Always keep a local file copy as backup or primary fallback
  saveFeedbackLocally({
    ...record,
    mailed: input.mailed || false,
    storedInDb,
  });

  return { record, storedInDb };
}

/**
 * Retrieve recent feedback entries from Supabase PostgreSQL (or local fallback).
 */
export async function getRecentFeedback(limit = 50): Promise<FeedbackRecord[]> {
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("feedback")
        .select("id, message, category, subject, rating, name, email, enrollment, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data as FeedbackRecord[];
      }
    } catch (err: any) {
      console.error("[Feedback DB] Failed to query Supabase:", err.message);
    }
  }

  // Fallback to local file
  const localList = getStoredFeedback();
  return localList.slice(0, limit) as FeedbackRecord[];
}
