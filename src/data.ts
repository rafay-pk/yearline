import Database from "@tauri-apps/plugin-sql";

export interface ChecklistItem {
  id: number;
  milestoneId: number;
  text: string;
  isDone: boolean;
  position: number;
}

export interface Milestone {
  id: number;
  projectId: number;
  title: string;
  startDate: string | null;
  endDate: string;
  color: string;
  position: number;
  checklist: ChecklistItem[];
}

export interface Project {
  id: number;
  title: string;
  emoji: string;
  notes: string;
  position: number;
  milestones: Milestone[];
}

export interface SpecialDate {
  id: number;
  date: string;
  label: string;
  color: string;
}

export interface AppSnapshot {
  projects: Project[];
  specialDates: SpecialDate[];
}

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  data: AppSnapshot;
}

interface ProjectRow {
  id: number;
  title: string;
  emoji: string;
  notes: string;
  position: number;
}

interface MilestoneRow {
  id: number;
  projectId: number;
  title: string;
  startDate: string | null;
  endDate: string;
  color: string;
  position: number;
}

interface ChecklistRow {
  id: number;
  milestoneId: number;
  text: string;
  isDone: number;
  position: number;
}

interface SpecialDateRow {
  id: number;
  date: string;
  label: string;
  color: string;
}

let databasePromise: Promise<Database> | null = null;

async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load("sqlite:yearline.db");
  }

  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execute("PRAGMA foreign_keys = ON");

  const statements = [
    `
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT NOT NULL,
        color TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        milestone_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        is_done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (milestone_id)
          REFERENCES milestones(id)
          ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS special_dates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_milestones_project
      ON milestones(project_id, position)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_checklist_milestone
      ON checklist_items(milestone_id, position)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_special_dates_date
      ON special_dates(date)
    `
  ];

  for (const statement of statements) {
    await db.execute(statement);
  }

  const projectColumns = await db.select<
    Array<{
      name: string;
    }>
  >("PRAGMA table_info(projects)");

  const hasEmojiColumn = projectColumns.some(
    (column) => column.name === "emoji"
  );

  if (!hasEmojiColumn) {
    await db.execute(`
      ALTER TABLE projects
      ADD COLUMN emoji TEXT NOT NULL DEFAULT '📌'
    `);
  }
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  const db = await getDatabase();

  const projectRows = await db.select<ProjectRow[]>(`
    SELECT
      id,
      title,
      emoji,
      notes,
      position
    FROM projects
    ORDER BY position, id
  `);

  const milestoneRows = await db.select<MilestoneRow[]>(`
    SELECT
      id,
      project_id AS projectId,
      title,
      start_date AS startDate,
      end_date AS endDate,
      color,
      position
    FROM milestones
    ORDER BY project_id, position, id
  `);

  const checklistRows = await db.select<ChecklistRow[]>(`
    SELECT
      id,
      milestone_id AS milestoneId,
      text,
      is_done AS isDone,
      position
    FROM checklist_items
    ORDER BY milestone_id, position, id
  `);

  const specialDateRows = await db.select<SpecialDateRow[]>(`
    SELECT
      id,
      date,
      label,
      color
    FROM special_dates
    ORDER BY date, id
  `);

  const projects: Project[] = projectRows.map((project) => ({
    ...project,
    milestones: milestoneRows
      .filter((milestone) => milestone.projectId === project.id)
      .map((milestone) => ({
        ...milestone,
        checklist: checklistRows
          .filter((item) => item.milestoneId === milestone.id)
          .map((item) => ({
            ...item,
            isDone: Boolean(item.isDone)
          }))
      }))
  }));

  return {
    projects,
    specialDates: specialDateRows
  };
}

export async function createProject(input: {
  title: string;
  emoji: string;
  notes?: string;
  position: number;
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.execute(
    `
      INSERT INTO projects (
        title,
        color,
        emoji,
        notes,
        position
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      input.title,
      "#6C63FF",
      input.emoji,
      input.notes ?? "",
      input.position
    ]
  );

  if (result.lastInsertId === undefined) {
    throw new Error(
      "The project was created but its ID was not returned."
    );
  }

  return Number(result.lastInsertId);
}

export async function updateProject(input: {
  id: number;
  title: string;
  emoji: string;
  notes: string;
}): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `
      UPDATE projects
      SET
        title = $1,
        emoji = $2,
        notes = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `,
    [
      input.title,
      input.emoji,
      input.notes,
      input.id
    ]
  );
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    "DELETE FROM projects WHERE id = $1",
    [id]
  );
}

export async function createMilestone(input: {
  projectId: number;
  title: string;
  startDate: string | null;
  endDate: string;
  color: string;
  position: number;
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.execute(
    `
      INSERT INTO milestones (
        project_id,
        title,
        start_date,
        end_date,
        color,
        position
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.projectId,
      input.title,
      input.startDate,
      input.endDate,
      input.color,
      input.position
    ]
  );

  if (result.lastInsertId === undefined) {
    throw new Error("The milestone was created but its ID was not returned.");
  }

  return Number(result.lastInsertId);
}

export async function updateMilestone(input: {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string;
  color: string;
}): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `
      UPDATE milestones
      SET
        title = $1,
        start_date = $2,
        end_date = $3,
        color = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `,
    [
      input.title,
      input.startDate,
      input.endDate,
      input.color,
      input.id
    ]
  );
}

export async function deleteMilestone(
  project: Project,
  milestoneId: number
): Promise<void> {
  const db = await getDatabase();

  const milestones = [...project.milestones].sort(
    (a, b) => a.position - b.position
  );

  const index = milestones.findIndex(
    (milestone) => milestone.id === milestoneId
  );

  if (index === -1) {
    return;
  }

  if (milestones.length === 1) {
    throw new Error("Every project must have at least one milestone.");
  }

  if (index === 0) {
    const nextMilestone = milestones[1];

    await db.execute(
      `
        UPDATE milestones
        SET
          start_date = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [
        milestones[0].startDate,
        nextMilestone.id
      ]
    );
  }

  await db.execute(
    "DELETE FROM milestones WHERE id = $1",
    [milestoneId]
  );

  const remainingMilestones = milestones.filter(
    (milestone) => milestone.id !== milestoneId
  );

  for (let position = 0; position < remainingMilestones.length; position += 1) {
    await db.execute(
      `
        UPDATE milestones
        SET position = $1
        WHERE id = $2
      `,
      [
        position,
        remainingMilestones[position].id
      ]
    );
  }
}

export async function addChecklistItem(input: {
  milestoneId: number;
  text: string;
  position: number;
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.execute(
    `
      INSERT INTO checklist_items (
        milestone_id,
        text,
        is_done,
        position
      )
      VALUES ($1, $2, 0, $3)
    `,
    [
      input.milestoneId,
      input.text,
      input.position
    ]
  );

  if (result.lastInsertId === undefined) {
    throw new Error("The checklist item ID was not returned.");
  }

  return Number(result.lastInsertId);
}

export async function updateChecklistItem(input: {
  id: number;
  text?: string;
  isDone?: boolean;
}): Promise<void> {
  const db = await getDatabase();

  if (input.text !== undefined) {
    await db.execute(
      `
        UPDATE checklist_items
        SET
          text = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [
        input.text,
        input.id
      ]
    );
  }

  if (input.isDone !== undefined) {
    await db.execute(
      `
        UPDATE checklist_items
        SET
          is_done = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [
        input.isDone ? 1 : 0,
        input.id
      ]
    );
  }
}

export async function deleteChecklistItem(id: number): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    "DELETE FROM checklist_items WHERE id = $1",
    [id]
  );
}

export async function createSpecialDate(input: {
  date: string;
  label: string;
  color: string;
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.execute(
    `
      INSERT INTO special_dates (
        date,
        label,
        color
      )
      VALUES ($1, $2, $3)
    `,
    [
      input.date,
      input.label,
      input.color
    ]
  );

  if (result.lastInsertId === undefined) {
    throw new Error("The special-date ID was not returned.");
  }

  return Number(result.lastInsertId);
}

export async function updateSpecialDate(input: {
  id: number;
  date: string;
  label: string;
  color: string;
}): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `
      UPDATE special_dates
      SET
        date = $1,
        label = $2,
        color = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `,
    [
      input.date,
      input.label,
      input.color,
      input.id
    ]
  );
}

export async function deleteSpecialDate(id: number): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    "DELETE FROM special_dates WHERE id = $1",
    [id]
  );
}

export function createExportPayload(
  snapshot: AppSnapshot
): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: snapshot
  };
}

export function parseImportPayload(value: unknown): AppSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("This is not a valid Yearline JSON file.");
  }

  const payload = value as Partial<ExportPayload>;

  if (payload.version !== 1) {
    throw new Error("This Yearline export version is not supported.");
  }

  if (!payload.data) {
    throw new Error("The export does not contain calendar data.");
  }

  if (!Array.isArray(payload.data.projects)) {
    throw new Error("The project list is missing or invalid.");
  }

  if (!Array.isArray(payload.data.specialDates)) {
    throw new Error("The special-date list is missing or invalid.");
  }

  for (const project of payload.data.projects) {
    if (
      typeof project.id !== "number" ||
      typeof project.title !== "string" ||
      typeof project.emoji !== "string" ||
      !Array.isArray(project.milestones)
    ) {
      throw new Error("The export contains an invalid project.");
    }

    for (const milestone of project.milestones) {
      if (
        typeof milestone.id !== "number" ||
        typeof milestone.title !== "string" ||
        typeof milestone.endDate !== "string" ||
        !Array.isArray(milestone.checklist)
      ) {
        throw new Error("The export contains an invalid milestone.");
      }
    }
  }

  return {
    ...payload.data,
    projects: payload.data.projects.map(
      (project) => ({
        ...project,
        emoji:
          typeof project.emoji === "string" &&
          project.emoji.trim()
            ? project.emoji
            : "📌"
      })
    )
  };
}

export async function replaceSnapshot(
  snapshot: AppSnapshot
): Promise<void> {
  const db = await getDatabase();

  await db.execute("DELETE FROM checklist_items");
  await db.execute("DELETE FROM milestones");
  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM special_dates");

  for (const project of snapshot.projects) {
    await db.execute(
      `
        INSERT INTO projects (
          id,
          title,
          color,
          emoji,
          notes,
          position
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        project.id,
        project.title,
        "#6C63FF",
        project.emoji || "📌",
        project.notes ?? "",
        project.position
      ]
    );

    for (const milestone of project.milestones) {
      await db.execute(
        `
          INSERT INTO milestones (
            id,
            project_id,
            title,
            start_date,
            end_date,
            color,
            position
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          milestone.id,
          project.id,
          milestone.title,
          milestone.startDate,
          milestone.endDate,
          milestone.color,
          milestone.position
        ]
      );

      for (const item of milestone.checklist) {
        await db.execute(
          `
            INSERT INTO checklist_items (
              id,
              milestone_id,
              text,
              is_done,
              position
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            item.id,
            milestone.id,
            item.text,
            item.isDone ? 1 : 0,
            item.position
          ]
        );
      }
    }
  }

  for (const specialDate of snapshot.specialDates) {
    await db.execute(
      `
        INSERT INTO special_dates (
          id,
          date,
          label,
          color
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        specialDate.id,
        specialDate.date,
        specialDate.label,
        specialDate.color
      ]
    );
  }
}

export async function splitMilestoneAtDate(
  input: {
    projectId: number;
    sourceMilestoneId: number;
    sourcePosition: number;
    splitDate: string;
    newEndDate: string;
    newTitle: string;
    newColor: string;
  }
): Promise<number> {
  const db = await getDatabase();

  /*
    Make room after the milestone being split.
    Do not use BEGIN IMMEDIATE through separate
    plugin execute calls.
  */
  await db.execute(
    `
      UPDATE milestones
      SET
        position = position + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE
        project_id = $1
        AND position > $2
    `,
    [
      input.projectId,
      input.sourcePosition
    ]
  );

  await db.execute(
    `
      UPDATE milestones
      SET
        end_date = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE
        id = $2
        AND project_id = $3
    `,
    [
      input.splitDate,
      input.sourceMilestoneId,
      input.projectId
    ]
  );

  const result = await db.execute(
    `
      INSERT INTO milestones (
        project_id,
        title,
        start_date,
        end_date,
        color,
        position
      )
      VALUES (
        $1,
        $2,
        NULL,
        $3,
        $4,
        $5
      )
    `,
    [
      input.projectId,
      input.newTitle,
      input.newEndDate,
      input.newColor,
      input.sourcePosition + 1
    ]
  );

  if (result.lastInsertId === undefined) {
    throw new Error(
      "The new milestone ID was not returned."
    );
  }

  return Number(result.lastInsertId);
}

export async function reorderChecklistItems(input: {
  milestoneId: number;
  orderedItemIds: number[];
}): Promise<void> {
  const { milestoneId, orderedItemIds } = input;

  if (orderedItemIds.length === 0) {
    return;
  }

  const db = await getDatabase();

  const positionCases = orderedItemIds
    .map(
      (_, index) =>
        `WHEN $${index + 2} THEN ${index}`
    )
    .join("\n");

  const itemPlaceholders = orderedItemIds
    .map((_, index) => `$${index + 2}`)
    .join(", ");

  await db.execute(
    `
      UPDATE checklist_items
      SET
        position = CASE id
          ${positionCases}
          ELSE position
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE
        milestone_id = $1
        AND id IN (${itemPlaceholders})
    `,
    [
      milestoneId,
      ...orderedItemIds
    ]
  );
}