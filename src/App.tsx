import calendarIcon from "./assets/calendar.svg";
import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ask,
  message,
  open,
  save
} from "@tauri-apps/plugin-dialog";

import {
  addChecklistItem,
  AppSnapshot,
  ChecklistItem,
  createExportPayload,
  createMilestone,
  createProject,
  createSpecialDate,
  deleteChecklistItem,
  deleteMilestone,
  deleteProject,
  deleteSpecialDate,
  initializeDatabase,
  loadSnapshot,
  Milestone,
  parseImportPayload,
  Project,
  replaceSnapshot,
  SpecialDate,
  updateChecklistItem,
  updateMilestone,
  updateProject,
  updateSpecialDate,
  insertMilestoneAtDate,
  reorderChecklistItems
} from "./data";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import "./styles.css";

const DAY_MS = 86_400_000;

const COLORS = [
  "#FF4D4D",
  "#FF6B6B",
  "#FF84BA",
  "#F72585",
  "#B11226",
  "#8338EC",
  "#E056FD",
  "#3A86FF",
  
  "#FBBC04",
  "#F4A261",
  "#EBD5AB",
  "#FB8500",
  "#5C2A1D",
  "#6C63FF",
  "#836ca7",
  "#38BDF8",
  
  "#00A896",
  "#219EBC",
  "#99DDCC",
  "#8AC926",
  "#063B00",
  "#3949AB",
  "#8C9097",
  "#1C262B",
];

const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun"
];

const MIN_UI_SCALE = 0.7;
const MAX_UI_SCALE = 1.6;
const UI_SCALE_STEP = 0.1;

const FONT_OPTIONS = [
  {
    label: "Inter",
    value:
      '"Inter Variable", Inter, sans-serif'
  },
  {
    label: "Manrope",
    value:
      '"Manrope Variable", Manrope, sans-serif'
  },
  {
    label: "IBM Plex Sans",
    value:
      '"IBM Plex Sans Variable", "IBM Plex Sans", sans-serif'
  },
  {
    label: "Source Sans 3",
    value:
      '"Source Sans 3 Variable", "Source Sans 3", sans-serif'
  },
  {
    label: "Nunito Sans",
    value:
      '"Nunito Sans Variable", "Nunito Sans", sans-serif'
  },
  {
    label: "Work Sans",
    value:
      '"Work Sans Variable", "Work Sans", sans-serif'
  },
  {
    label: "Rubik",
    value:
      '"Rubik Variable", Rubik, sans-serif'
  },
  {
    label: "Figtree",
    value:
      '"Figtree Variable", Figtree, sans-serif'
  },
  {
    label: "DM Sans",
    value:
      '"DM Sans Variable", "DM Sans", sans-serif'
  },
  {
    label: "Plus Jakarta Sans",
    value:
      '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", sans-serif'
  }
] as const;

const PROJECT_EMOJIS = [
  "🧪","🌱","⭐","🔥","✅","⌚️","🌐","📱","📲","💻","⌨️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📞","☎️","📟","📠","📺","📻","⏰","⌛️","⏳","📡","🔋","🔌","💡","🔦","💼","💸","💵","💴","💶","💷","💰","💳","💎","⚖️","🔧","🔨","🛠️","🔩","⚙️","⛓","🔫","💣","🔪","⚔️","🪓","🦯","🚬","⚰️","⚱️","🏺","🔮","📿","💈","⚗️","🔭","🔬","💊","💉","🩸","🩹","🩺","🪒","🚽","🚰","🚿","🛁","🛀","🛎","🔑","🚪","🪑","🛌","🛒","🎁","🎈","🎏","🎀","🎊","🎉","🎎","🏮","🎐","✉️","📩","📨","📧","💌","📥","📤","📦","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","📊","📈","📉","📆","📅","📇","🗃","🗳","🗄","📋","📁","📂","🗂","🗞","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🔗","📐","📏","📍","📌","🎌","🏳️","🏴","🏁","🪔","✂️","✒️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","🏭","🏗️","🏠","🏡","🗿","🗽","⛲️","🗼","🏰","🏯","🎡","🎢","🎠","🚢","⚓️","🚧","⛽️","🚏","🚦","🚥","🚈","🚂","🚆","🚇","🚊","🚉","🚁","✈️","🛫","🛬","🚀","💺","🛶","⛵️","🎭","🎨","🎬","🎵","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🪕","🎲","🎯","🎳","🎮","🎰","🛷","🥌","🪀","🪁","🏆","🎫","🎪"
];

function clampUiScale(value: number): number {
  return Math.min(
    MAX_UI_SCALE,
    Math.max(MIN_UI_SCALE, value)
  );
}

function roundUiScale(value: number): number {
  return Math.round(value * 10) / 10;
}

type Theme = "light" | "dark";

type Selection =
  | {
      kind: "project";
      id: number;
    }
  | {
      kind: "milestone";
      id: number;
    }
  | {
      kind: "special";
      id: number;
    }
  | {
      kind: "date";
      date: string;
    }
  | null;

interface DragPayload {
  action: "start" | "end";
  milestoneId: number;
  anchorDate: string;
}

interface HistoryEntry {
  id: string;
  label: string;
  timestamp: string;
  before: AppSnapshot;
  after: AppSnapshot;
}

interface ActivityEntry {
  id: string;
  text: string;
  timestamp: string;
  type: "action" | "undo" | "redo";
}

type MilestoneInsertionPlacement =
  | "before"
  | "after";

function setDragPayload(
  event: React.DragEvent<HTMLElement>,
  payload: DragPayload
): void {
  const serializedPayload =
    JSON.stringify(payload);

  event.dataTransfer.effectAllowed = "move";

  // Custom type used by Yearline.
  event.dataTransfer.setData(
    "application/yearline",
    serializedPayload
  );

  // WebView2-compatible fallback.
  event.dataTransfer.setData(
    "text/plain",
    serializedPayload
  );
}

interface ChecklistTextEditorProps {
  item: ChecklistItem;
  onSave: (input: {
    id: number;
    text: string;
  }) => void | Promise<void>;
}

function ChecklistTextEditor({
  item,
  onSave
}: ChecklistTextEditorProps) {
  const [text, setText] = useState(item.text);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setText(item.text);
  }, [item.id, item.text]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    /*
      Reset the height first so the textarea can
      also shrink when text is removed.
    */
    textarea.style.height = "0px";
    textarea.style.height =
      `${textarea.scrollHeight}px`;
  }, [text]);

  function saveText(): void {
    const nextText = text.trim();

    if (!nextText) {
      setText(item.text);
      return;
    }

    setText(nextText);

    if (nextText !== item.text) {
      void onSave({
        id: item.id,
        text: nextText
      });
    }
  }

  return (
    <textarea
      ref={textareaRef}
      className={[
        "checklist-textarea",
        item.isDone
          ? "checklist-textarea-complete"
          : ""
      ]
        .filter(Boolean)
        .join(" ")}
      rows={1}
      value={text}
      aria-label="Checklist task"
      onChange={(event) =>
        setText(event.target.value)
      }
      onBlur={saveText}
      onKeyDown={(event) => {
        /*
          Enter remains available for intentional
          line breaks. Ctrl+Enter saves the task.
        */
        if (
          event.key === "Enter" &&
          (event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setText(item.text);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface WeekLaneLayout {
  laneByProject: Map<number, number>;
  projectCount: number;
}

interface RenderTrack extends TrackInfo {
  localLanePosition: number;
  lineThickness: number;
  handleSize: number;
}

function calculateLanePosition(
  laneIndex: number,
  projectCount: number
): number {
  if (projectCount <= 1) {
    return 50;
  }

  /*
    More padding for small project counts.
    Less padding when many projects must fit.
  */
  const edgePadding =
    projectCount === 2
      ? 28
      : projectCount === 3
        ? 20
        : projectCount <= 5
          ? 11
          : 5;

  const availableSpace =
    100 - edgePadding * 2;

  return (
    edgePadding +
    laneIndex *
      (availableSpace / (projectCount - 1))
  );
}

function timelineMetrics(
  projectCount: number
): {
  lineThickness: number;
  handleSize: number;
} {
  if (projectCount <= 3) {
    return {
      lineThickness: 4,
      handleSize: 9
    };
  }

  if (projectCount <= 5) {
    return {
      lineThickness: 3,
      handleSize: 8
    };
  }

  return {
    lineThickness: 2,
    handleSize: 7
  };
}

interface TrackInfo {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
  segmentStart: string;
  segmentEnd: string;
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
  complete: boolean;
}

function parseYmd(value: string): number {
  const [year, month, day] = value
    .split("-")
    .map(Number);

  return Date.UTC(year, month - 1, day);
}

function formatYmd(
  year: number,
  monthIndex: number,
  day: number
): string {
  return [
    year.toString().padStart(4, "0"),
    (monthIndex + 1).toString().padStart(2, "0"),
    day.toString().padStart(2, "0")
  ].join("-");
}

function localToday(): string {
  const now = new Date();

  return formatYmd(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
}

function addDays(
  value: string,
  amount: number
): string {
  const result = new Date(
    parseYmd(value) + amount * DAY_MS
  );

  return formatYmd(
    result.getUTCFullYear(),
    result.getUTCMonth(),
    result.getUTCDate()
  );
}

function compareDates(
  first: string,
  second: string
): number {
  return parseYmd(first) - parseYmd(second);
}

function clampDate(
  value: string,
  minimum: string,
  maximum?: string
): string {
  let result = value;

  if (compareDates(result, minimum) < 0) {
    result = minimum;
  }

  if (
    maximum &&
    compareDates(result, maximum) > 0
  ) {
    result = maximum;
  }

  return result;
}

function monthDays(
  year: number,
  monthIndex: number
): Array<string | null> {
  const firstDay = new Date(
    Date.UTC(year, monthIndex, 1)
  ).getUTCDay();

  // Convert Sunday-first to Monday-first.
  const leadingBlanks = (firstDay + 6) % 7;

  const numberOfDays = new Date(
    Date.UTC(year, monthIndex + 1, 0)
  ).getUTCDate();

  const cells: Array<string | null> = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= numberOfDays; day += 1) {
    cells.push(formatYmd(year, monthIndex, day));
  }

  while (cells.length < 42) {
    cells.push(null);
  }

  return cells;
}

function monthTitle(
  year: number,
  monthIndex: number
): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long"
  }).format(
    new Date(Date.UTC(year, monthIndex, 1))
  );
}

function sortedMilestones(
  project: Project
): Milestone[] {
  return [...project.milestones].sort(
    (first, second) =>
      first.position - second.position
  );
}

function isMilestoneComplete(
  milestone: Milestone
): boolean {
  return (
    milestone.checklist.length > 0 &&
    milestone.checklist.every(
      (item) => item.isDone
    )
  );
}

function projectAppearsInMonth(
  project: Project,
  year: number,
  monthIndex: number
): boolean {
  const firstDay = formatYmd(
    year,
    monthIndex,
    1
  );

  const lastDayNumber = new Date(
    Date.UTC(year, monthIndex + 1, 0)
  ).getUTCDate();

  const lastDay = formatYmd(
    year,
    monthIndex,
    lastDayNumber
  );

  const milestones =
    sortedMilestones(project);

  return milestones.some(
    (milestone, milestoneIndex) => {
      const segmentStart =
        milestoneIndex === 0
          ? milestone.startDate
          : milestones[
              milestoneIndex - 1
            ].endDate;

      if (!segmentStart) {
        return false;
      }

      return (
        compareDates(segmentStart, lastDay) <= 0 &&
        compareDates(
          milestone.endDate,
          firstDay
        ) >= 0
      );
    }
  );
}

function projectInterval(
  project: Project
): {
  start: string;
  end: string;
} | null {
  const milestones = sortedMilestones(project);

  if (
    milestones.length === 0 ||
    !milestones[0].startDate
  ) {
    return null;
  }

  return {
    start: milestones[0].startDate,
    end: milestones[milestones.length - 1].endDate
  };
}

interface DateMilestoneEntry {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}

function milestonesForDate(
  snapshot: AppSnapshot,
  date: string
): DateMilestoneEntry[] {
  return snapshot.projects.flatMap(
    (project) => {
      const milestones =
        sortedMilestones(project);

      return milestones.flatMap(
        (milestone, milestoneIndex) => {
          const segmentStart =
            milestoneIndex === 0
              ? milestone.startDate
              : milestones[
                  milestoneIndex - 1
                ].endDate;

          if (!segmentStart) {
            return [];
          }

          const appearsOnDate =
            compareDates(date, segmentStart) >= 0 &&
            compareDates(
              date,
              milestone.endDate
            ) <= 0;

          return appearsOnDate
            ? [
                {
                  project,
                  milestone,
                  milestoneIndex
                }
              ]
            : [];
        }
      );
    }
  );
}

function assignProjectLanes(
  projects: Project[]
): {
  lanes: Map<number, number>;
  laneCount: number;
} {
  const entries = projects
    .map((project) => {
      const interval = projectInterval(project);

      return interval
        ? {
            project,
            ...interval
          }
        : null;
    })
    .filter(
      (
        entry
      ): entry is {
        project: Project;
        start: string;
        end: string;
      } => Boolean(entry)
    )
    .sort((first, second) => {
      const startDifference = compareDates(
        first.start,
        second.start
      );

      if (startDifference !== 0) {
        return startDifference;
      }

      return compareDates(
        first.end,
        second.end
      );
    });

  const laneEndDates: string[] = [];
  const lanes = new Map<number, number>();

  for (const entry of entries) {
    let lane = laneEndDates.findIndex(
      (endDate) =>
        compareDates(endDate, entry.start) < 0
    );

    if (lane === -1) {
      lane = laneEndDates.length;
      laneEndDates.push(entry.end);
    } else {
      laneEndDates[lane] = entry.end;
    }

    lanes.set(entry.project.id, lane);
  }

  return {
    lanes,
    laneCount: Math.max(1, laneEndDates.length)
  };
}

function tracksForDate(
  project: Project,
  date: string,
  lane: number
): TrackInfo[] {
  const milestones = sortedMilestones(project);
  const results: TrackInfo[] = [];

  for (
    let milestoneIndex = 0;
    milestoneIndex < milestones.length;
    milestoneIndex += 1
  ) {
    const milestone = milestones[milestoneIndex];

    /*
      A later milestone begins on the previous milestone's
      deadline. This allows both colored segments to meet
      in the middle of that date cell.
    */
    const segmentStart =
      milestoneIndex === 0
        ? milestone.startDate
        : milestones[milestoneIndex - 1].endDate;

    if (!segmentStart) {
      continue;
    }

    const segmentEnd = milestone.endDate;

    if (
      compareDates(date, segmentStart) >= 0 &&
      compareDates(date, segmentEnd) <= 0
    ) {
      results.push({
        project,
        milestone,
        milestoneIndex,
        segmentStart,
        segmentEnd,
        lane,
        startsHere: date === segmentStart,
        endsHere: date === segmentEnd,
        complete: isMilestoneComplete(milestone)
      });
    }
  }

  return results;
}

function findMilestoneContext(
  snapshot: AppSnapshot,
  milestoneId: number
): {
  project: Project;
  milestones: Milestone[];
  milestone: Milestone;
  index: number;
  previous: Milestone | null;
  next: Milestone | null;
} | null {
  for (const project of snapshot.projects) {
    const milestones = sortedMilestones(project);

    const index = milestones.findIndex(
      (milestone) => milestone.id === milestoneId
    );

    if (index !== -1) {
      return {
        project,
        milestones,
        milestone: milestones[index],
        index,
        previous:
          index > 0 ? milestones[index - 1] : null,
        next:
          index < milestones.length - 1
            ? milestones[index + 1]
            : null
      };
    }
  }

  return null;
}

function findMilestoneByChecklistItem(
  snapshot: AppSnapshot,
  checklistItemId: number
): {
  project: Project;
  milestone: Milestone;
} | null {
  for (const project of snapshot.projects) {
    for (const milestone of project.milestones) {
      const containsItem =
        milestone.checklist.some(
          (item) =>
            item.id === checklistItemId
        );

      if (containsItem) {
        return {
          project,
          milestone
        };
      }
    }
  }

  return null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default function App() {
  const [snapshot, setSnapshot] =
    useState<AppSnapshot>({
      projects: [],
      specialDates: []
    }
  );

  const [appFont, setAppFont] =
  useState<string>(() => {
    return (
      localStorage.getItem(
        "yearline-font"
      ) ?? FONT_OPTIONS[0].value
    );
  });

  const [selection, setSelection] =
    useState<Selection>(null);

  const [year, setYear] = useState(
    new Date().getFullYear()
  );

  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme =
      localStorage.getItem("yearline-theme");

    if (
      savedTheme === "light" ||
      savedTheme === "dark"
    ) {
      return savedTheme;
    }

    return window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "dark"
      : "light";
  });

  const [uiScale, setUiScale] = useState<number>(() => {
  const storedValue = Number(
    localStorage.getItem("yearline-ui-scale")
  );
  if (Number.isFinite(storedValue)) {
    return clampUiScale(storedValue);
  }
  return 1;
  });

  const [
    confettiBurstId,
    setConfettiBurstId
  ] = useState(0);

  const [
    showConfetti,
    setShowConfetti
  ] = useState(false);

  const confettiTimerRef =
    useRef<number | null>(null);

  const [history, setHistory] =
  useState<HistoryEntry[]>([]);

  const [historyIndex, setHistoryIndex] =
    useState(-1);

  const [activity, setActivity] =
    useState<ActivityEntry[]>([]);

  const historyRef =
    useRef<HistoryEntry[]>([]);

  const historyIndexRef = useRef(-1);

  const canUndo = historyIndex >= 0;

  const canRedo =
    historyIndex < history.length - 1;

  function updateHistoryState(
    entries: HistoryEntry[],
    index: number
  ): void {
    historyRef.current = entries;
    historyIndexRef.current = index;

    setHistory(entries);
    setHistoryIndex(index);
  }

  function addActivity(
    text: string,
    type: ActivityEntry["type"] = "action"
  ): void {
    setActivity((current) =>
      [
        {
          id: crypto.randomUUID(),
          text,
          type,
          timestamp: new Date().toISOString()
        },
        ...current
      ].slice(0, 50)
    );
  }

  async function commitAction(
    label: string,
    mutation: () => Promise<void>
  ): Promise<void> {
    await runAction(async () => {
      const before = await loadSnapshot();

      await mutation();

      const after = await loadSnapshot();

      setSnapshot(after);

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        label,
        timestamp: new Date().toISOString(),
        before,
        after
      };

      const existingHistory =
        historyRef.current.slice(
          0,
          historyIndexRef.current + 1
        );

      /*
        Limit memory usage to the most recent
        100 actions.
      */
      const nextHistory = [
        ...existingHistory,
        entry
      ].slice(-100);

      updateHistoryState(
        nextHistory,
        nextHistory.length - 1
      );

      addActivity(label);
    });
  }

  async function handleUndo(): Promise<void> {
    await runAction(async () => {
      const index = historyIndexRef.current;

      if (index < 0) {
        return;
      }

      const entry = historyRef.current[index];

      await replaceSnapshot(entry.before);

      const restored = await loadSnapshot();

      setSnapshot(restored);
      setSelection(null);

      updateHistoryState(
        historyRef.current,
        index - 1
      );

      addActivity(
        `Undo: ${entry.label}`,
        "undo"
      );
    });
  }

  async function handleRedo(): Promise<void> {
    await runAction(async () => {
      const nextIndex =
        historyIndexRef.current + 1;

      if (
        nextIndex >= historyRef.current.length
      ) {
        return;
      }

      const entry =
        historyRef.current[nextIndex];

      await replaceSnapshot(entry.after);

      const restored = await loadSnapshot();

      setSnapshot(restored);
      setSelection(null);

      updateHistoryState(
        historyRef.current,
        nextIndex
      );

      addActivity(
        `Redo: ${entry.label}`,
        "redo"
      );
    });
  }
  
  function launchConfetti(): void {
  if (confettiTimerRef.current !== null) {
    window.clearTimeout(
      confettiTimerRef.current
    );
  }

  setConfettiBurstId(
    (current) => current + 1
  );

  setShowConfetti(true);

  confettiTimerRef.current =
    window.setTimeout(() => {
      setShowConfetti(false);
      confettiTimerRef.current = null;
    }, 1500);
  }

  const laneLayout = useMemo(
    () => assignProjectLanes(snapshot.projects),
    [snapshot.projects]
  );

  async function refresh(): Promise<AppSnapshot> {
    const nextSnapshot = await loadSnapshot();
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }

  async function runAction(
    action: () => Promise<void>
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      await message(errorText(error), {
        title: "Yearline",
        kind: "error"
      });
    }
  }

  async function handleAddMilestoneToProject(
    projectId: number,
    date: string,
    placement: MilestoneInsertionPlacement
  ): Promise<void> {
    const currentSnapshot =
      await loadSnapshot();

    const choice =
      activeProjectChoicesForDate(
        currentSnapshot,
        date
      ).find(
        (entry) =>
          entry.project.id === projectId
      );

    if (!choice) {
      await message(
        "This project does not span the selected date.",
        {
          title: "Add milestone",
          kind: "warning"
        }
      );

      return;
    }

    const {
      project,
      milestone
    } = choice;

    const newEndDate =
      placement === "before"
        ? date
        : compareDates(
              milestone.endDate,
              date
            ) > 0
          ? milestone.endDate
          : addDays(date, 14);

    const newColor =
      COLORS[
        (
          milestone.position +
          project.id +
          1
        ) % COLORS.length
      ];

    let createdMilestoneId = 0;

    await commitAction(
      `Inserted milestone ${
        placement === "before"
          ? "before"
          : "after"
      } "${milestone.title}" on ${formatLongDate(
        date
      )}`,
      async () => {
        createdMilestoneId =
          await insertMilestoneAtDate({
            projectId: project.id,
            sourceMilestoneId:
              milestone.id,
            sourcePosition:
              milestone.position,
            sourceStartDate:
              milestone.startDate,
            splitDate: date,
            newEndDate,
            newTitle: `Milestone ${
              project.milestones.length + 1
            }`,
            newColor,
            placement
          });
      }
    );

    if (createdMilestoneId !== 0) {
      setSelection({
        kind: "milestone",
        id: createdMilestoneId
      });
    }
  }

  useEffect(() => {
    void runAction(async () => {
      await initializeDatabase();
      await refresh();
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font",
      appFont
    );

    localStorage.setItem(
      "yearline-font",
      appFont
    );
  }, [appFont]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("yearline-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      "yearline-ui-scale",
      String(uiScale)
    );

    void getCurrentWebview()
      .setZoom(uiScale)
      .catch((error) => {
        console.error(
          "Could not change the Yearline zoom level:",
          error
        );
      });
  }, [uiScale]);

  useEffect(() => {
    function handleZoomShortcut(
    event: KeyboardEvent): void {
      if (!event.ctrlKey) {
        return;
      }

      const zoomIn =
        event.key === "+" ||
        event.key === "=" ||
        event.code === "NumpadAdd";

      const zoomOut =
        event.key === "-" ||
        event.code === "NumpadSubtract";

      const resetZoom =
        event.key === "0" ||
        event.code === "Numpad0";

      if (!zoomIn && !zoomOut && !resetZoom) {
        return;
      }

      event.preventDefault();

      if (resetZoom) {
        setUiScale(1);
        return;
      }

      setUiScale((currentScale) => {
        const nextScale = zoomIn
          ? currentScale + UI_SCALE_STEP
          : currentScale - UI_SCALE_STEP;

        return clampUiScale(
          roundUiScale(nextScale)
        );
      });
    }

    window.addEventListener(
      "keydown",
      handleZoomShortcut
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleZoomShortcut
      );
    };
  }, []);

  const shouldClosePanelRef = useRef(false);

  useEffect(() => {
    if (!selection) {
      shouldClosePanelRef.current = false;
      return;
    }

    function handlePointerDown(
      event: PointerEvent
    ): void {
      const target = event.target;

      if (!(target instanceof Node)) {
        shouldClosePanelRef.current = false;
        return;
      }

      /*
        This runs before any button's onClick changes
        the selected right-side panel.
      */
      const panel = document.querySelector(
        ".side-panel"
      );

      const element =
        target instanceof Element
          ? target
          : target.parentElement;

      const opensAnotherPanel =
        element?.closest(
          '[data-panel-trigger="true"]'
        ) !== null;

      shouldClosePanelRef.current = Boolean(
        panel &&
        !panel.contains(target) &&
        !opensAnotherPanel
      );
    }

    function handleDocumentClick(): void {
      /*
        The input blur event has already happened by
        this point, so automatic saving can complete
        before the panel is unmounted.
      */
      if (shouldClosePanelRef.current) {
        setSelection(null);
      }

      shouldClosePanelRef.current = false;
    }

    function handleEscape(
      event: KeyboardEvent
    ): void {
      if (event.key !== "Escape") {
        return;
      }

      const activeElement =
        document.activeElement;

      if (
        activeElement instanceof HTMLElement &&
        document
          .querySelector(".side-panel")
          ?.contains(activeElement)
      ) {
        activeElement.blur();
      }

      setSelection(null);
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      true
    );

    document.addEventListener(
      "click",
      handleDocumentClick
    );

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true
      );

      document.removeEventListener(
        "click",
        handleDocumentClick
      );

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [selection]);

  useEffect(() => {
    return () => {
      if (
        confettiTimerRef.current !== null
      ) {
        window.clearTimeout(
          confettiTimerRef.current
        );
      }
    };
  }, []);

  async function handleCreateProject(
    requestedStartDate?: string
  ): Promise<void> {
    const startDate =
      requestedStartDate ??
      formatYmd(year, 0, 1);

    let projectId = 0;

    await commitAction(
      `Created project starting ${startDate}`,
      async () => {
        const current = await loadSnapshot();

        const projectEmoji =
          PROJECT_EMOJIS[
            current.projects.length %
              PROJECT_EMOJIS.length
          ];

        const milestoneColor =
          COLORS[
            current.projects.length %
              COLORS.length
          ];

        projectId = await createProject({
          title: "New project",
          emoji: projectEmoji,
          notes: "",
          position: current.projects.length
        });

        await createMilestone({
          projectId,
          title: "First milestone",
          startDate,
          endDate: addDays(startDate, 13),
          color: milestoneColor,
          position: 0
        });
      }
    );

    if (projectId !== 0) {
      setSelection({
        kind: "project",
        id: projectId
      });
    }
  }

  async function handleAddMilestone(
    project: Project
  ): Promise<void> {
    await runAction(async () => {
      const milestones = sortedMilestones(project);
      const previous =
        milestones[milestones.length - 1];

      const position = milestones.length;

      const color =
        COLORS[
          (
            snapshot.projects.length +
            position
          ) % COLORS.length
        ];

      const milestoneId = await createMilestone({
        projectId: project.id,
        title: `Milestone ${position + 1}`,
        startDate: null,
        endDate: previous
          ? addDays(previous.endDate, 14)
          : addDays(formatYmd(year, 0, 1), 13),
        color,
        position
      });

      await refresh();

      setSelection({
        kind: "milestone",
        id: milestoneId
      });
    });
  }

  async function handleAddSpecialDate(
    date?: string
  ): Promise<void> {
    const defaultDate =
      date ??
      (
        year === new Date().getFullYear()
          ? localToday()
          : formatYmd(year, 0, 1)
      );

    let specialDateId = 0;

    await commitAction(
      `Added special date on ${defaultDate}`,
      async () => {
        specialDateId =
          await createSpecialDate({
            date: defaultDate,
            label: "Special date",
            color: "#FFD166"
          });
      }
    );

    if (specialDateId !== 0) {
      setSelection({
        kind: "special",
        id: specialDateId
      });
    }
}

  async function handleExport(): Promise<void> {
    await runAction(async () => {
      const path = await save({
        title: "Export all Yearline data",
        defaultPath:
          "yearline-all-data.json",
        filters: [
          {
            name: "Yearline JSON",
            extensions: ["json"]
          }
        ]
      });

      if (!path) {
        return;
      }

      /*
        Load directly from SQLite so every year
        and all current user data is included.
      */
      const fullSnapshot =
        await loadSnapshot();

      const payload =
        createExportPayload(fullSnapshot);

      await invoke("write_text_file", {
        path,
        contents: JSON.stringify(
          payload,
          null,
          2
        )
      });

      addActivity(
        "Exported all calendar data"
      );

      await message(
        "All Yearline data was exported successfully.",
        {
          title: "Yearline",
          kind: "info"
        }
      );
    });
  }

  async function handleImport(): Promise<void> {
    await runAction(async () => {
      const path = await open({
        title: "Import Yearline calendar",
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Yearline JSON",
            extensions: ["json"]
          }
        ]
      });

      if (typeof path !== "string") {
        return;
      }

      const contents = await invoke<string>(
        "read_text_file",
        {
          path
        }
      );

      const imported = parseImportPayload(
        JSON.parse(contents)
      );

      const confirmed = await ask(
        "Importing will replace the calendar currently stored on this computer. Continue?",
        {
          title: "Import calendar",
          kind: "warning"
        }
      );

      if (!confirmed) {
        return;
      }

      await commitAction(
        "Imported all calendar data",
        () => replaceSnapshot(imported)
      );
      setSelection(null);

      await message("Calendar imported successfully.", {
        title: "Yearline",
        kind: "info"
      });
    });
  }

async function handleDateDrop(
    payload: DragPayload,
    targetDate: string
  ): Promise<void> {
    const currentSnapshot =
      await loadSnapshot();

    const context = findMilestoneContext(
      currentSnapshot,
      payload.milestoneId
    );

    if (!context) {
      return;
    }

    const {
      milestone,
      previous,
      next,
      index
    } = context;

    if (payload.action === "start") {
      if (
        index !== 0 ||
        !milestone.startDate ||
        targetDate === milestone.startDate
      ) {
        return;
      }

      const newStart =
        compareDates(
          targetDate,
          milestone.endDate
        ) > 0
          ? milestone.endDate
          : targetDate;

      await commitAction(
        `Changed start of "${milestone.title}" to ${newStart}`,
        () =>
          updateMilestone({
            ...milestone,
            startDate: newStart
          })
      );

      return;
    }

    const minimumEnd =
      index === 0
        ? milestone.startDate ?? targetDate
        : previous!.endDate;

    const maximumEnd =
      next?.endDate;

    const newEnd = clampDate(
      targetDate,
      minimumEnd,
      maximumEnd
    );

    if (newEnd === milestone.endDate) {
      return;
    }

    await commitAction(
      `Changed deadline of "${milestone.title}" to ${newEnd}`,
      () =>
        updateMilestone({
          ...milestone,
          endDate: newEnd
        })
    );
  }

  async function handleChecklistItemUpdate(
    input: {
      id: number;
      text?: string;
      isDone?: boolean;
    }
  ): Promise<void> {
    const beforeSnapshot =
      await loadSnapshot();

    const beforeContext =
      findMilestoneByChecklistItem(
        beforeSnapshot,
        input.id
      );

    const wasComplete = beforeContext
      ? isMilestoneComplete(
          beforeContext.milestone
        )
      : false;

    await commitAction(
      input.isDone === true
        ? "Completed checklist item"
        : input.isDone === false
          ? "Reopened checklist item"
          : "Updated checklist item",
      () => updateChecklistItem(input)
    );

    /*
      Confetti is only relevant when an item has
      just been checked.
    */
    if (
      input.isDone !== true ||
      wasComplete
    ) {
      return;
    }

    const afterSnapshot =
      await loadSnapshot();

    const afterContext =
      findMilestoneByChecklistItem(
        afterSnapshot,
        input.id
      );

    if (
      afterContext &&
      isMilestoneComplete(
        afterContext.milestone
      )
    ) {
      launchConfetti();

      addActivity(
        `Completed milestone "${afterContext.milestone.title}"`
      );
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark" />
        <p>Opening Yearline…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {showConfetti && (
        <ConfettiBurst
          key={confettiBurstId}
        />
      )}
      <header className="topbar">
        <div className="brand-zone">
          <div className="brand">
            <div className="brand-icon-container">
              <img
                className="brand-icon"
                src={calendarIcon}
                alt=""
              />
            </div>

            <div className="brand-copy">
              <h1>Yearline</h1>
              <p>Personal milestone planning</p>
            </div>
          </div>

          <div className="brand-tools">
            <button
              className="icon-button toolbar-icon-button"
              disabled={!canUndo}
              onClick={() => void handleUndo()}
              title="Undo"
              aria-label="Undo"
            >
              ↶
            </button>

            <button
              className="icon-button toolbar-icon-button"
              disabled={!canRedo}
              onClick={() => void handleRedo()}
              title="Redo"
              aria-label="Redo"
            >
              ↷
            </button>

            <select
              className="font-select"
              value={appFont}
              onChange={(event) =>
                setAppFont(event.target.value)
              }
              title="Application font"
              aria-label="Application font"
            >
              {FONT_OPTIONS.map((font) => (
                <option
                  key={font.label}
                  value={font.value}
                >
                  {font.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="year-controls">
          <button
            className="icon-button"
            onClick={() => setYear(year - 1)}
            aria-label="Previous year"
          >
            ←
          </button>

          <button
            className="year-button"
            onClick={() =>
              setYear(new Date().getFullYear())
            }
          >
            {year}
          </button>

          <button
            className="icon-button"
            onClick={() => setYear(year + 1)}
            aria-label="Next year"
          >
            →
          </button>
        </div>

        <div className="toolbar-actions">
          <button
            className="secondary-button"
            onClick={() => void handleImport()}
          >
            Import
          </button>

          <button
            className="secondary-button"
            onClick={() => void handleExport()}
          >
            Export
          </button>

          <button
            className="zoom-indicator"
            onClick={() => setUiScale(1)}
            title="Ctrl++ to zoom in, Ctrl+- to zoom out, Ctrl+0 to reset"
          >
            {Math.round(uiScale * 100)}%
          </button>

          <button
            className="theme-button"
            onClick={() =>
              setTheme(
                theme === "light" ? "dark" : "light"
              )
            }
            aria-label="Change theme"
          >
            {theme === "light" ? "◐" : "☀"}
          </button>

          <button
            className="secondary-button"
            onClick={() =>
              void handleAddSpecialDate()
            }
          >
            Special date
          </button>

          <button
            className="primary-button"
            onClick={() =>
              void handleCreateProject()
            }
          >
            + New project
          </button>
        </div>
      </header>

      <div className="legend-bar">
        {snapshot.projects.length === 0 ? (
          <span className="empty-legend">
            Create a project to begin planning.
          </span>
        ) : (
          snapshot.projects.map((project) => (
            <button
              key={project.id}
              data-panel-trigger="true"
              className="legend-project"
              onClick={() =>
                setSelection({
                  kind: "project",
                  id: project.id
                })
              }
            >
              <span className="legend-emoji">
                {project.emoji}
              </span>

              {project.title}
            </button>
          ))
        )}

        <span className="legend-help">
          Drag a line to move it. Drag its end marker
          to change its deadline.
        </span>
      </div>

      <main className="calendar-scroll">
        <div className="year-grid">
          {Array.from(
            {
              length: 12
            },
            (_, monthIndex) => (
              <MonthCard
                key={`${year}-${monthIndex}`}
                year={year}
                monthIndex={monthIndex}
                snapshot={snapshot}
                laneLayout={laneLayout}
                selection={selection}
                onSelect={setSelection}
                onDropDate={(payload, date) =>
                  void handleDateDrop(payload, date)
                }
              />
            )
          )}
        </div>
      </main>

      <SidePanel
        snapshot={snapshot}
        selection={selection}
        activity={activity}

        onCreateProjectFromDate={(date) =>
          void handleCreateProject(date)
        }

        onAddSpecialDate={(date) =>
          void handleAddSpecialDate(date)
        }
        onClose={() => setSelection(null)}
        onSelect={setSelection}
        onSaveProject={(input) =>
          commitAction(
            `Updated project "${input.title}"`,
            () => updateProject(input)
          )
        }
        onDeleteProject={(project) =>
          runAction(async () => {
            const confirmed = await ask(
              `Delete “${project.title}” and all of its milestones?`,
              {
                title: "Delete project",
                kind: "warning"
              }
            );

            if (!confirmed) {
              return;
            }

            await deleteProject(project.id);
            await refresh();
            setSelection(null);
          })
        }
        onAddMilestone={(project) =>
          void handleAddMilestone(project)
        }
        onAddMilestoneToProject={(
          projectId,
          date,
          placement
        ) =>
          void handleAddMilestoneToProject(
            projectId,
            date,
            placement
          )
        }
        onSaveMilestone={(input) =>
          commitAction(
            `Updated milestone "${input.title}"`,
            () => updateMilestone(input)
          )
        }
        onDeleteMilestone={(project, milestone) =>
          runAction(async () => {
            const confirmed = await ask(
              `Delete “${milestone.title}”?`,
              {
                title: "Delete milestone",
                kind: "warning"
              }
            );

            if (!confirmed) {
              return;
            }

            await deleteMilestone(
              project,
              milestone.id
            );

            await refresh();

            setSelection({
              kind: "project",
              id: project.id
            });
          })
        }
        onAddChecklistItem={(milestone, text) =>
          commitAction(
            `Added checklist item to "${milestone.title}"`,
            async () => {
              await addChecklistItem({
                milestoneId: milestone.id,
                text,
                position:
                  milestone.checklist.length
              });
            }
          )
        }
        onUpdateChecklistItem={(input) =>
          handleChecklistItemUpdate(input)
        }
        onDeleteChecklistItem={(item) =>
          commitAction(
            `Deleted checklist item "${item.text}"`,
            () => deleteChecklistItem(item.id)
          )
        }
        onSaveSpecialDate={(input) =>
          commitAction(
            `Updated special date "${input.label}"`,
            () => updateSpecialDate(input)
          )
        }
        onDeleteSpecialDate={(specialDate) =>
          runAction(async () => {
            await deleteSpecialDate(
              specialDate.id
            );

            await refresh();
            setSelection(null);
          })
        }
        onReorderChecklistItems={(input) =>
          commitAction(
            "Reordered checklist tasks",
            () =>
              reorderChecklistItems(input)
          )
        }
      />
    </div>
  );
}

interface MonthCardProps {
  year: number;
  monthIndex: number;
  snapshot: AppSnapshot;
  laneLayout: {
    lanes: Map<number, number>;
    laneCount: number;
  };
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDropDate: (
    payload: DragPayload,
    date: string
  ) => void;
}

function MonthCard({
  year,
  monthIndex,
  snapshot,
  laneLayout,
  selection,
  onSelect,
  onDropDate,
}: MonthCardProps) {
  const cells = useMemo(
    () => monthDays(year, monthIndex),
    [year, monthIndex]
  );
  const today = localToday();
  const weekLaneLayouts =
  useMemo<WeekLaneLayout[]>(() => {
    return Array.from(
      {
        length: 6
      },
      (_, weekIndex) => {
        const weekDates = cells
          .slice(
            weekIndex * 7,
            weekIndex * 7 + 7
          )
          .filter(
            (
              date
            ): date is string =>
              typeof date === "string"
          );

        const activeProjects =
          snapshot.projects
            .filter((project) => {
              const globalLane =
                laneLayout.lanes.get(
                  project.id
                );

              if (
                globalLane === undefined
              ) {
                return false;
              }

              return weekDates.some(
                (date) =>
                  tracksForDate(
                    project,
                    date,
                    globalLane
                  ).length > 0
              );
            })
            .sort(
              (
                firstProject,
                secondProject
              ) => {
                const firstLane =
                  laneLayout.lanes.get(
                    firstProject.id
                  ) ?? 0;

                const secondLane =
                  laneLayout.lanes.get(
                    secondProject.id
                  ) ?? 0;

                return firstLane - secondLane;
              }
            );

        return {
          laneByProject: new Map(
            activeProjects.map(
              (project, index) => [
                project.id,
                index
              ]
            )
          ),
          projectCount:
            activeProjects.length
        };
      }
    );
  }, [
    cells,
    snapshot.projects,
    laneLayout
  ]);
  const projectCount = snapshot.projects.filter(
    (project) =>
      projectAppearsInMonth(
        project,
        year,
        monthIndex
      )
  ).length;

  return (
    <section className="month-card">
      <header className="month-header">
        <h2>{monthTitle(year, monthIndex)}</h2>

        {projectCount > 0 && (
          <span>
            {projectCount}
            {projectCount === 1
              ? " project"
              : " projects"}
          </span>
        )}
      </header>

      <div className="weekday-grid">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday}>
            {weekday}
          </div>
        ))}
      </div>

      <div
        className="month-days"
        style={
          {
            "--lane-count":
              laneLayout.laneCount
          } as React.CSSProperties
        }
      >
        {cells.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                className="empty-day"
              />
            );
          }

          const weekIndex = Math.floor(index / 7);

          const weekLayout =
            weekLaneLayouts[weekIndex];

          const metrics = timelineMetrics(
            weekLayout.projectCount
          );

          const dayNumber = Number(
            date.slice(-2)
          );

          const specialDates =
            snapshot.specialDates.filter(
              (specialDate) =>
                specialDate.date === date
            );

          const tracks: RenderTrack[] =
            snapshot.projects.flatMap(
              (project) => {
                const globalLane =
                  laneLayout.lanes.get(project.id);

                const localLane =
                  weekLayout.laneByProject.get(
                    project.id
                  );

                if (
                  globalLane === undefined ||
                  localLane === undefined
                ) {
                  return [];
                }

                const projectTracks =
                  tracksForDate(
                    project,
                    date,
                    globalLane
                  );

                const localLanePosition =
                  calculateLanePosition(
                    localLane,
                    weekLayout.projectCount
                  );

                return projectTracks.map(
                  (track) => ({
                    ...track,
                    localLanePosition,
                    lineThickness:
                      metrics.lineThickness,
                    handleSize:
                      metrics.handleSize
                  })
                );
              }
            );

          tracks.sort((first, second) => {
            /*
              Projects remain in their local lane order.
            */
            if (
              first.localLanePosition !==
              second.localLanePosition
            ) {
              return (
                first.localLanePosition -
                second.localLanePosition
              );
            }

            /*
              At a milestone boundary, render the segment
              ending on this date after the segment starting
              on this date. Its connector stays on top.
            */
            if (
              first.endsHere !== second.endsHere
            ) {
              return first.endsHere ? 1 : -1;
            }

            return (
              first.milestoneIndex -
              second.milestoneIndex
            );
          });

          return (
            <div
              key={date}
              data-panel-trigger="true"
              className={[
                "calendar-day",
                date === today ? "today" : "",
                specialDates.length > 0
                  ? "special-day"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                onSelect({
                  kind: "date",
                  date
                })
              }
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect =
                  "move";
              }}
              onDrop={(event) => {
                event.preventDefault();

                const raw =
                  event.dataTransfer.getData(
                    "application/yearline"
                  ) ||
                  event.dataTransfer.getData(
                    "text/plain"
                  );

                if (!raw) {
                  return;
                }

                try {
                  const payload =
                    JSON.parse(
                      raw
                    ) as DragPayload;

                  onDropDate(payload, date);
                } catch {
                  // Ignore invalid drag data.
                }
              }}
              title="Click to view this date"
            >
              <div className="date-header">
                <span className="date-number">
                  {dayNumber}
                </span>

                {specialDates.length > 0 && (
                  <div className="special-indicators">
                    {specialDates
                      .slice(0, 3)
                      .map((specialDate) => (
                        <button
                          key={specialDate.id}
                          data-panel-trigger="true"
                          className="special-dot"
                          style={{
                            backgroundColor:
                              specialDate.color
                          }}
                          title={specialDate.label}
                          onClick={(event) => {
                            event.stopPropagation();

                            onSelect({
                              kind: "special",
                              id: specialDate.id
                            });
                          }}
                        />
                      ))}
                  </div>
                )}
              </div>

              <div className="timeline-area">
                {tracks.map((track) => {
                  const selected =
                    selection?.kind ===
                      "milestone" &&
                    selection.id ===
                      track.milestone.id;

                  return (
                    <div
                      key={`${track.project.id}-${track.milestone.id}-${track.milestoneIndex}`}
                      data-panel-trigger="true"
                      className={[
                        "timeline-line",
                        track.startsHere
                          ? "line-start"
                          : "",
                        track.endsHere
                          ? "line-end"
                          : "",
                        track.complete
                          ? "line-complete"
                          : "",
                        selected
                          ? "line-selected"
                          : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        {
                          "--lane-position":
                            `${track.localLanePosition}%`,
                          "--line-color":
                            track.milestone.color,
                          "--line-thickness":
                            `${track.lineThickness}px`,
                          "--handle-size":
                            `${track.handleSize}px`
                        } as React.CSSProperties
                      }
                      title={`${track.project.title} — ${track.milestone.title}`}
                      onClick={(event) => {
                        event.stopPropagation();

                        onSelect({
                          kind: "milestone",
                          id: track.milestone.id
                        });
                      }}
                    >
                      {track.startsHere &&
                        track.milestoneIndex ===
                          0 && (
                          <span
                            className="date-handle start-handle"
                            draggable
                            title="Drag to change the project start date"
                            onDragStart={(event) => {
                              event.stopPropagation();

                              setDragPayload(event, {
                                action: "start",
                                milestoneId: track.milestone.id,
                                anchorDate: date
                              });
                            }}
                          />
                        )}

                      {track.endsHere && (
                        <span
                          className={[
                            "date-handle",
                            "end-handle",
                            track.complete
                              ? "complete-marker"
                              : ""
                          ].join(" ")}
                          draggable
                          title="Drag to change the milestone deadline"
                          onDragStart={(event) => {
                            event.stopPropagation();

                            setDragPayload(event, {
                              action: "end",
                              milestoneId: track.milestone.id,
                              anchorDate: date
                            });
                          }}
                        >
                          {track.complete ? "✓" : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface ActivityLogProps {
  entries: ActivityEntry[];
}

function ActivityLog({
  entries
}: ActivityLogProps) {
  return (
    <section className="panel-section activity-section">
      <div className="section-heading">
        <div>
          <h3>Activity</h3>
          <p>
            Changes, undo actions and redo
            actions from this session.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="panel-empty-message">
          No changes have been made yet.
        </p>
      ) : (
        <div className="activity-list">
          {entries.slice(0, 15).map(
            (entry) => (
              <div
                key={entry.id}
                className={[
                  "activity-item",
                  `activity-${entry.type}`
                ].join(" ")}
              >
                <span className="activity-marker" />

                <div>
                  <strong>{entry.text}</strong>

                  <small>
                    {new Date(
                      entry.timestamp
                    ).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      }
                    )}
                  </small>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

interface DateEditorProps {
  date: string;
  snapshot: AppSnapshot;
  activity: ActivityEntry[];
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onCreateProject: (date: string) => void;
  onAddSpecialDate: (date: string) => void;
  onAddMilestoneToProject: (
    projectId: number,
    date: string,
    placement: MilestoneInsertionPlacement
  ) => void;
}

function DateEditor({
  date,
  snapshot,
  activity,
  onClose,
  onSelect,
  onCreateProject,
  onAddSpecialDate,
  onAddMilestoneToProject
}: DateEditorProps) {
  const entries = milestonesForDate(
    snapshot,
    date
  );

  const projectChoices =
    activeProjectChoicesForDate(
      snapshot,
      date
    );

  const [
    selectedProjectId,
    setSelectedProjectId
  ] = useState(
    projectChoices[0]
      ? String(
          projectChoices[0].project.id
        )
      : ""
  );

  const selectedProjectChoice =
    projectChoices.find(
      ({ project }) =>
        String(project.id) ===
        selectedProjectId
    ) ?? projectChoices[0];

  const selectedMilestoneTitle =
    selectedProjectChoice?.milestone.title ??
    "selected milestone";

  const specialDates =
    snapshot.specialDates.filter(
      (specialDate) =>
        specialDate.date === date
    );

  return (
    <aside className="side-panel">
      <PanelHeader
        eyebrow="Calendar date"
        title={formatLongDate(date)}
        onClose={onClose}
      />

      <div className="panel-content">
        <section className="date-panel-actions">
          <button
            className="primary-button full-width"
            data-panel-trigger="true"
            onClick={() =>
              onCreateProject(date)
            }
          >
            + New project from this date
          </button>

          <button
            className="secondary-button full-width"
            data-panel-trigger="true"
            onClick={() =>
              onAddSpecialDate(date)
            }
          >
            + Add special date
          </button>

          <div className="date-project-action">
            <label htmlFor="date-project-select">
              Add a milestone to an existing project
            </label>

            {projectChoices.length > 0 ? (
              <>
                <select
                  id="date-project-select"
                  value={selectedProjectId}
                  onChange={(event) =>
                    setSelectedProjectId(
                      event.target.value
                    )
                  }
                >
                  {projectChoices.map(
                    ({
                      project,
                      milestone
                    }) => (
                      <option
                        key={project.id}
                        value={project.id}
                      >
                        {project.title} — {" "}
                        {milestone.title}
                      </option>
                    )
                  )}
                </select>

                <div className="date-milestone-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!selectedProjectId}
                    onClick={() => {
                      const projectId = Number(
                        selectedProjectId
                      );

                      if (
                        Number.isFinite(projectId)
                      ) {
                        onAddMilestoneToProject(
                          projectId,
                          date,
                          "before"
                        );
                      }
                    }}
                  >
                    + Add new milestone before{" "}
                    {selectedMilestoneTitle}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!selectedProjectId}
                    onClick={() => {
                      const projectId = Number(
                        selectedProjectId
                      );

                      if (
                        Number.isFinite(projectId)
                      ) {
                        onAddMilestoneToProject(
                          projectId,
                          date,
                          "after"
                        );
                      }
                    }}
                  >
                    + Add new milestone after{" "}
                    {selectedMilestoneTitle}
                  </button>
                </div>
              </>
            ) : (
              <p className="panel-empty-message">
                No existing project spans this date.
              </p>
            )}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Project stages spanning this date</h3>

              <p>
                These milestone periods include
                {` ${formatLongDate(date)}.`}
              </p>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="panel-empty-message">
              No project stage spans this date.
            </p>
          ) : (
            <div className="milestone-list">
              {entries.map(
                ({
                  project,
                  milestone,
                  milestoneIndex
                }) => (
                  <button
                    key={`${project.id}-${milestone.id}-${milestoneIndex}`}
                    type="button"
                    date-panel-navigation="true"
                    className="milestone-list-item"
                    onClick={() =>
                      onSelect({
                        kind: "milestone",
                        id: milestone.id
                      })
                    }
                  >
                    <span
                      className="milestone-color"
                      style={{
                        backgroundColor:
                          milestone.color
                      }}
                    />

                    <span className="milestone-list-copy">
                      <strong>
                        {milestone.title}
                      </strong>

                      <small>
                        {project.title}
                      </small>
                    </span>

                    <span className="list-arrow">
                      ›
                    </span>
                  </button>
                )
              )}
            </div>
          )}
        </section>

        {specialDates.length > 0 && (
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <h3>Special dates</h3>
              </div>
            </div>

            <div className="milestone-list">
              {specialDates.map(
                (specialDate) => (
                  <button
                    key={specialDate.id}
                    type="button"
                    date-panel-navigation="true"
                    className="milestone-list-item"
                    onClick={() =>
                      onSelect({
                        kind: "special",
                        id: specialDate.id
                      })
                    }
                  >
                    <span
                      className="milestone-color"
                      style={{
                        backgroundColor:
                          specialDate.color
                      }}
                    />

                    <span className="milestone-list-copy">
                      <strong>
                        {specialDate.label}
                      </strong>
                    </span>

                    <span className="list-arrow">
                      ›
                    </span>
                  </button>
                )
              )}
            </div>
          </section>
        )}

        <ActivityLog entries={activity} />
      </div>
    </aside>
  );
}

function ordinalDay(day: number): string {
  const remainder100 = day % 100;

  if (
    remainder100 >= 11 &&
    remainder100 <= 13
  ) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;

    case 2:
      return `${day}nd`;

    case 3:
      return `${day}rd`;

    default:
      return `${day}th`;
  }
}

function formatLongDate(
  value: string | null
): string {
  if (!value) {
    return "No date";
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const monthName =
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC"
    }).format(
      new Date(
        Date.UTC(year, month - 1, day)
      )
    );

  return `${ordinalDay(day)} ${monthName}, ${year}`;
}

interface SidePanelProps {
  snapshot: AppSnapshot;
  selection: Selection;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onSaveProject: (input: {
    id: number;
    title: string;
    emoji: string;
    notes: string;
  }) => Promise<void>;
  onDeleteProject: (
    project: Project
  ) => Promise<void>;
  onAddMilestone: (
    project: Project
  ) => void;
  onAddMilestoneToProject: (
    projectId: number,
    date: string,
    placement: MilestoneInsertionPlacement
  ) => void;
  onSaveMilestone: (input: {
    id: number;
    title: string;
    startDate: string | null;
    endDate: string;
    color: string;
  }) => Promise<void>;
  onDeleteMilestone: (
    project: Project,
    milestone: Milestone
  ) => Promise<void>;
  onAddChecklistItem: (
    milestone: Milestone,
    text: string
  ) => Promise<void>;
  onUpdateChecklistItem: (input: {
    id: number;
    text?: string;
    isDone?: boolean;
  }) => Promise<void>;
  onDeleteChecklistItem: (
    item: ChecklistItem
  ) => Promise<void>;
  onSaveSpecialDate: (input: {
    id: number;
    date: string;
    label: string;
    color: string;
  }) => Promise<void>;
  onDeleteSpecialDate: (
    specialDate: SpecialDate
  ) => Promise<void>;
  activity: ActivityEntry[];
  onCreateProjectFromDate: (
    date: string
  ) => void;
  onAddSpecialDate: (
    date: string
  ) => void;
  onReorderChecklistItems: (input: {
  milestoneId: number;
  orderedItemIds: number[];
}) => void | Promise<void>;
}

function SidePanel({
  snapshot,
  selection,
  activity,
  onCreateProjectFromDate,
  onAddSpecialDate,
  onClose,
  onSelect,
  onSaveProject,
  onDeleteProject,
  onAddMilestone,
  onAddMilestoneToProject,
  onSaveMilestone,
  onDeleteMilestone,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onSaveSpecialDate,
  onDeleteSpecialDate,
  onReorderChecklistItems
}: SidePanelProps) {
  if (!selection) {
    return null;
  }

  if (selection.kind === "project") {
    const project = snapshot.projects.find(
      (candidate) =>
        candidate.id === selection.id
    );

    if (!project) {
      return null;
    }

    return (
      <ProjectEditor
        key={project.id}
        project={project}
        onClose={onClose}
        onSelect={onSelect}
        onSave={onSaveProject}
        onDelete={onDeleteProject}
        onAddMilestone={onAddMilestone}
      />
    );
  }

  if (selection.kind === "milestone") {
    const context = findMilestoneContext(
      snapshot,
      selection.id
    );

    if (!context) {
      return null;
    }

    return (
      <MilestoneEditor
        key={context.milestone.id}
        context={context}
        onClose={onClose}
        onSelect={onSelect}
        onSave={onSaveMilestone}
        onDelete={onDeleteMilestone}
        onAddChecklistItem={
          onAddChecklistItem
        }
        onUpdateChecklistItem={
          onUpdateChecklistItem
        }
        onDeleteChecklistItem={
          onDeleteChecklistItem
        }
          onReorderChecklistItems={
          onReorderChecklistItems
        }
      />
    );
  }

  if (selection.kind === "date") {
    return (
      <DateEditor
        date={selection.date}
        snapshot={snapshot}
        activity={activity}
        onClose={onClose}
        onSelect={onSelect}
        onCreateProject={
          onCreateProjectFromDate
        }
        onAddSpecialDate={
          onAddSpecialDate
        }
        onAddMilestoneToProject={
          onAddMilestoneToProject
        }
      />
    );
  }

  const specialDate =
    snapshot.specialDates.find(
      (candidate) =>
        candidate.id === selection.id
    );

  if (!specialDate) {
    return null;
  }

  return (
    <SpecialDateEditor
      key={specialDate.id}
      specialDate={specialDate}
      onClose={onClose}
      onSave={onSaveSpecialDate}
      onDelete={onDeleteSpecialDate}
    />
  );
}

interface ProjectEditorProps {
  project: Project;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onSave: (input: {
    id: number;
    title: string;
    emoji: string;
    notes: string;
  }) => Promise<void>;
  onDelete: (
    project: Project
  ) => Promise<void>;
  onAddMilestone: (
    project: Project
  ) => void;
}

function ProjectEditor({
  project,
  onClose,
  onSelect,
  onSave,
  onDelete,
  onAddMilestone
}: ProjectEditorProps) {
  const [title, setTitle] = useState(
    project.title
  );

  const [emoji, setEmoji] = useState(
    project.emoji || "📌"
  );

  const [notes, setNotes] = useState(
    project.notes
  );


  const milestones =
    sortedMilestones(project);

  return (
    <aside className="side-panel">
      <PanelHeader
        eyebrow="Project"
        title={`${project.emoji} ${project.title}`}
        onClose={onClose}
      />

      <div className="panel-content">
        <div className="editor-form">
          <Field label="Project name">
            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                const nextTitle = title.trim();

                if (!nextTitle) {
                  setTitle(project.title);
                  return;
                }

                if (
                  nextTitle !== project.title ||
                  emoji !== project.emoji ||
                  notes !== project.notes
                ) {
                  void onSave({
                    id: project.id,
                    title: nextTitle,
                    emoji,
                    notes
                  });
                }
              }}
              autoFocus
            />
          </Field>

          <Field label="Project emoji">
            <EmojiPicker
              value={emoji}
              onChange={(nextEmoji) => {
                setEmoji(nextEmoji);

                void onSave({
                  id: project.id,
                  title:
                    title.trim() || project.title,
                  emoji: nextEmoji,
                  notes
                });
              }}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              onBlur={() => {
                if (
                  notes !== project.notes ||
                  title.trim() !== project.title ||
                  emoji !== project.emoji
                ) {
                  void onSave({
                    id: project.id,
                    title:
                      title.trim() || project.title,
                    emoji,
                    notes
                  });
                }
              }}
              rows={7}
              placeholder="Add project notes…"
            />
          </Field>
        </div>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Milestones</h3>
              <p>
                The first milestone has a start
                and end date. Later milestones
                only have deadlines.
              </p>
            </div>

            <button
              className="small-button"
              onClick={() =>
                onAddMilestone(project)
              }
            >
              ➕
            </button>
          </div>

          <div className="milestone-list">
            {milestones.map(
              (milestone, index) => {
                const complete =
                  isMilestoneComplete(
                    milestone
                  );

                return (
                  <button
                    key={milestone.id}
                    className="milestone-list-item"
                    onClick={() =>
                      onSelect({
                        kind: "milestone",
                        id: milestone.id
                      })
                    }
                  >
                    <span
                      className="milestone-color"
                      style={{
                        backgroundColor:
                          milestone.color
                      }}
                    />

                    <span className="milestone-list-copy">
                      <strong>
                        {milestone.title}
                      </strong>

                      <small>
                        {index === 0 &&
                        milestone.startDate
                          ? `${formatLongDate(
                              milestone.startDate
                            )} → ${formatLongDate(
                              milestone.endDate
                            )}`
                          : `Due ${formatLongDate(
                              milestone.endDate
                            )}`}
                      </small>
                    </span>

                    {complete && (
                      <span className="complete-badge">
                        Done
                      </span>
                    )}

                    <span className="list-arrow">
                      ›
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </section>

        <button
          className="danger-button full-width"
          onClick={() =>
            void onDelete(project)
          }
        >
          Delete project
        </button>
      </div>
    </aside>
  );
}

interface ActiveProjectChoice {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}

function activeProjectChoicesForDate(
  snapshot: AppSnapshot,
  date: string
): ActiveProjectChoice[] {
  return snapshot.projects.flatMap(
    (project) => {
      const milestones =
        sortedMilestones(project);

      const matches = milestones
        .map(
          (
            milestone,
            milestoneIndex
          ) => {
            const segmentStart =
              milestoneIndex === 0
                ? milestone.startDate
                : milestones[
                    milestoneIndex - 1
                  ].endDate;

            if (!segmentStart) {
              return null;
            }

            const spansDate =
              compareDates(
                date,
                segmentStart
              ) >= 0 &&
              compareDates(
                date,
                milestone.endDate
              ) <= 0;

            return spansDate
              ? {
                  project,
                  milestone,
                  milestoneIndex
                }
              : null;
          }
        )
        .filter(
          (
            match
          ): match is ActiveProjectChoice =>
            Boolean(match)
        );

      /*
        At a milestone boundary both segments may
        include the same date. Prefer the incoming
        segment so the timeline remains ordered.
      */
      const match =
        matches[matches.length - 1];

      return match ? [match] : [];
    }
  );
}

interface MilestoneEditorProps {
  context: NonNullable<
    ReturnType<typeof findMilestoneContext>
  >;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onSave: (input: {
    id: number;
    title: string;
    startDate: string | null;
    endDate: string;
    color: string;
  }) => Promise<void>;
  onDelete: (
    project: Project,
    milestone: Milestone
  ) => Promise<void>;
  onAddChecklistItem: (
    milestone: Milestone,
    text: string
  ) => Promise<void>;
  onUpdateChecklistItem: (input: {
    id: number;
    text?: string;
    isDone?: boolean;
  }) => Promise<void>;
  onDeleteChecklistItem: (
    item: ChecklistItem
  ) => Promise<void>;
  onReorderChecklistItems: (input: {
    milestoneId: number;
    orderedItemIds: number[];
  }) => void | Promise<void>;
}

function MilestoneEditor({
  context,
  onClose,
  onSelect,
  onSave,
  onDelete,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onReorderChecklistItems
}: MilestoneEditorProps) {
  const {
    project,
    milestone,
    previous,
    next,
    index
  } = context;

  const [title, setTitle] = useState(
    milestone.title
  );

  const [startDate, setStartDate] = useState(
    milestone.startDate ?? ""
  );

  const [endDate, setEndDate] = useState(
    milestone.endDate
  );

  const [color, setColor] = useState(
    milestone.color
  );

  const [newChecklistText, setNewChecklistText] =
    useState("");

  const completedItems =
    milestone.checklist.filter(
      (item) => item.isDone
    ).length;

  const complete =
    isMilestoneComplete(milestone);

  const progress =
    milestone.checklist.length === 0
      ? 0
      : Math.round(
          (
            completedItems /
            milestone.checklist.length
          ) * 100
        );

  const [
    orderedChecklist,
    setOrderedChecklist
  ] = useState<ChecklistItem[]>(() =>
    [...milestone.checklist].sort(
      (first, second) =>
        first.position - second.position
    )
  );

  const [
    draggedChecklistItemId,
    setDraggedChecklistItemId
  ] = useState<number | null>(null);

  const [
    dragOverChecklistItemId,
    setDragOverChecklistItemId
  ] = useState<number | null>(null);

  const orderedChecklistRef =
    useRef<ChecklistItem[]>(
      orderedChecklist
    );

  const originalChecklistOrderRef =
    useRef<ChecklistItem[]>([]);

  const checklistDropCompletedRef =
    useRef(false);

  useEffect(() => {
    const nextChecklist = [
      ...milestone.checklist
    ].sort(
      (first, second) =>
        first.position - second.position
    );

    setOrderedChecklist(nextChecklist);
    orderedChecklistRef.current =
      nextChecklist;
  }, [
    milestone.id,
    milestone.checklist
  ]);

  function moveChecklistItem(
    draggedItemId: number,
    targetItemId: number
  ): void {
    if (draggedItemId === targetItemId) {
      return;
    }

    setOrderedChecklist((current) => {
      const fromIndex = current.findIndex(
        (item) =>
          item.id === draggedItemId
      );

      const targetIndex = current.findIndex(
        (item) =>
          item.id === targetItemId
      );

      if (
        fromIndex === -1 ||
        targetIndex === -1
      ) {
        return current;
      }

      const next = [...current];

      const [movedItem] = next.splice(
        fromIndex,
        1
      );

      next.splice(
        targetIndex,
        0,
        movedItem
      );

      const positionedItems = next.map(
        (item, position) => ({
          ...item,
          position
        })
      );

      orderedChecklistRef.current =
        positionedItems;

      return positionedItems;
    });
  }

  async function saveChecklistOrder(): Promise<void> {
    const currentOrder =
      orderedChecklistRef.current;

    const originalIds =
      originalChecklistOrderRef.current.map(
        (item) => item.id
      );

    const currentIds =
      currentOrder.map(
        (item) => item.id
      );

    const orderChanged =
      originalIds.length ===
        currentIds.length &&
      originalIds.some(
        (id, index) =>
          id !== currentIds[index]
      );

    checklistDropCompletedRef.current =
      true;

    setDraggedChecklistItemId(null);
    setDragOverChecklistItemId(null);

    if (!orderChanged) {
      return;
    }

    await onReorderChecklistItems({
      milestoneId: milestone.id,
      orderedItemIds: currentIds
    });
  }

  async function submitChecklist(
    event: FormEvent
  ): Promise<void> {
    event.preventDefault();

    const text = newChecklistText.trim();

    if (!text) {
      return;
    }

    setNewChecklistText("");
    await onAddChecklistItem(
      milestone,
      text
    );
  }

  return (
    <aside className="side-panel">
      <PanelHeader
        eyebrow="Milestone"
        title={milestone.title}
        onClose={onClose}
        backLabel={`${project.emoji} ${project.title}`}
        onBack={() =>
          onSelect({
            kind: "project",
            id: project.id
          })
        }
      />

      <div className="panel-content">
        <div
          className={[
            "completion-card",
            complete
              ? "completion-card-done"
              : ""
          ].join(" ")}
        >
          <div className="completion-summary">
            <div>
              <strong>
                {complete
                  ? "Milestone complete"
                  : `${progress}% complete`}
              </strong>

              <span>
                {completedItems} of{" "}
                {milestone.checklist.length}{" "}
                checklist items
              </span>
            </div>

            <span className="completion-number">
              {complete ? "✓" : `${progress}%`}
            </span>
          </div>

          <div className="progress-track">
            <div
              className="progress-value"
              style={{
                width: `${progress}%`,
                backgroundColor: color
              }}
            />
          </div>
        </div>

        <div className="editor-form">
          <Field label="Milestone name">
            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                const nextTitle = title.trim();

                if (!nextTitle) {
                  setTitle(milestone.title);
                  return;
                }

                if (nextTitle !== milestone.title) {
                  void onSave({
                    id: milestone.id,
                    title: nextTitle,
                    startDate:
                      index === 0
                        ? startDate
                        : null,
                    endDate,
                    color
                  });
                }
              }}
            />
          </Field>

          <Field label="Milestone color">
            <ColorPalette
              value={color}
              onChange={(nextColor) => {
                setColor(nextColor);

                void onSave({
                  id: milestone.id,
                  title:
                    title.trim() || milestone.title,
                  startDate:
                    index === 0
                      ? startDate
                      : null,
                  endDate,
                  color: nextColor
                });
              }}
            />
          </Field>

          {index === 0 && (
            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => {
                  const nextStartDate =
                    event.target.value;

                  if (!nextStartDate) {
                    return;
                  }

                  setStartDate(nextStartDate);

                  void onSave({
                    id: milestone.id,
                    title:
                      title.trim() ||
                      milestone.title,
                    startDate: nextStartDate,
                    endDate:
                      compareDates(
                        endDate,
                        nextStartDate
                      ) < 0
                        ? nextStartDate
                        : endDate,
                    color
                  });
                }}
              />

              <span className="formatted-date-preview">
                {formatLongDate(startDate)}
              </span>
            </Field>
          )}

          <Field
            label={
              index === 0
                ? "End date"
                : "Deadline"
            }
          >
            <input
              type="date"
              value={endDate}
              min={
                previous
                  ? previous.endDate
                  : startDate
              }
              max={next?.endDate}
              onChange={(event) => {
                const nextEndDate =
                  event.target.value;

                if (!nextEndDate) {
                  return;
                }

                setEndDate(nextEndDate);

                void onSave({
                  id: milestone.id,
                  title:
                    title.trim() ||
                    milestone.title,
                  startDate:
                    index === 0
                      ? startDate
                      : null,
                  endDate: nextEndDate,
                  color
                });
              }}
            />

            <span className="formatted-date-preview">
              {formatLongDate(endDate)}
            </span>
          </Field>
        </div>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Checklist</h3>
              <p>
                Completing every item
                automatically completes this
                milestone.
              </p>
            </div>
          </div>

          <div
            className="checklist-list"
            onDragOver={(event) => {
              if (
                draggedChecklistItemId !== null
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect =
                  "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              void saveChecklistOrder();
            }}
          >
            {orderedChecklist.map((item) => (
              <div
                key={item.id}
                draggable
                className={[
                  "checklist-item",
                  item.isDone
                    ? "checklist-item-complete"
                    : "",
                  draggedChecklistItemId ===
                  item.id
                    ? "checklist-item-dragging"
                    : "",
                  dragOverChecklistItemId ===
                    item.id &&
                  draggedChecklistItemId !==
                    item.id
                    ? "checklist-item-drag-over"
                    : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragStart={(event) => {
                  const target =
                    event.target as HTMLElement;

                  /*
                    Preserve normal interaction with the
                    checkbox, textarea and delete button.
                  */
                  if (
                    target.closest(
                      "input, textarea, button, a"
                    )
                  ) {
                    event.preventDefault();
                    return;
                  }

                  originalChecklistOrderRef.current =
                    [...orderedChecklistRef.current];

                  checklistDropCompletedRef.current =
                    false;

                  setDraggedChecklistItemId(
                    item.id
                  );

                  event.dataTransfer.effectAllowed =
                    "move";

                  event.dataTransfer.setData(
                    "text/plain",
                    String(item.id)
                  );
                }}
                onDragEnter={(event) => {
                  if (
                    draggedChecklistItemId ===
                      null ||
                    draggedChecklistItemId ===
                      item.id
                  ) {
                    return;
                  }

                  event.preventDefault();

                  setDragOverChecklistItemId(
                    item.id
                  );

                  moveChecklistItem(
                    draggedChecklistItemId,
                    item.id
                  );
                }}
                onDragOver={(event) => {
                  if (
                    draggedChecklistItemId !==
                    null
                  ) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect =
                      "move";
                  }
                }}
                onDragLeave={(event) => {
                  const nextTarget =
                    event.relatedTarget;

                  if (
                    nextTarget instanceof Node &&
                    event.currentTarget.contains(
                      nextTarget
                    )
                  ) {
                    return;
                  }

                  if (
                    dragOverChecklistItemId ===
                    item.id
                  ) {
                    setDragOverChecklistItemId(
                      null
                    );
                  }
                }}
                onDragEnd={() => {
                  /*
                    Restore the original order when the drag
                    is cancelled or released outside the list.
                  */
                  if (
                    !checklistDropCompletedRef.current
                  ) {
                    const originalOrder =
                      originalChecklistOrderRef.current;

                    setOrderedChecklist(
                      originalOrder
                    );

                    orderedChecklistRef.current =
                      originalOrder;
                  }

                  setDraggedChecklistItemId(null);
                  setDragOverChecklistItemId(null);

                  checklistDropCompletedRef.current =
                    false;
                }}
              >
                <input
                  type="checkbox"
                  checked={item.isDone}
                  aria-label={`Mark ${item.text} as complete`}
                  onChange={(event) =>
                    void onUpdateChecklistItem({
                      id: item.id,
                      isDone:
                        event.target.checked
                    })
                  }
                />

                <ChecklistTextEditor
                  item={item}
                  onSave={
                    onUpdateChecklistItem
                  }
                />

                <button
                  type="button"
                  className="checklist-delete-button"
                  title="Delete task"
                  aria-label={`Delete ${item.text}`}
                  onClick={() =>
                    void onDeleteChecklistItem(
                      item
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <form
            className="add-checklist-form"
            onSubmit={(event) =>
              void submitChecklist(event)
            }
          >
            <input
              value={newChecklistText}
              onChange={(event) =>
                setNewChecklistText(
                  event.target.value
                )
              }
              placeholder="New checklist item…"
            />

            <button
              className="small-button"
              type="submit"
            >
              Add
            </button>
          </form>
        </section>

        <button
          className="danger-button full-width"
          disabled={
            project.milestones.length === 1
          }
          title={
            project.milestones.length === 1
              ? "A project must keep at least one milestone."
              : undefined
          }
          onClick={() =>
            void onDelete(
              project,
              milestone
            )
          }
        >
          Delete milestone
        </button>
      </div>
    </aside>
  );
}

interface SpecialDateEditorProps {
  specialDate: SpecialDate;
  onClose: () => void;
  onSave: (input: {
    id: number;
    date: string;
    label: string;
    color: string;
  }) => Promise<void>;
  onDelete: (
    specialDate: SpecialDate
  ) => Promise<void>;
}

function SpecialDateEditor({
  specialDate,
  onClose,
  onSave,
  onDelete
}: SpecialDateEditorProps) {
  const [date, setDate] = useState(
    specialDate.date
  );

  const [label, setLabel] = useState(
    specialDate.label
  );

  const [color, setColor] = useState(
    specialDate.color
  );

  return (
    <aside className="side-panel">
      <PanelHeader
        eyebrow="Calendar marker"
        title={specialDate.label}
        onClose={onClose}
      />

      <div className="panel-content">
        <div className="editor-form">
          <Field label="Label">
            <input
              value={label}
              onChange={(event) =>
                setLabel(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                const nextLabel = label.trim();

                if (!nextLabel) {
                  setLabel(specialDate.label);
                  return;
                }

                if (
                  nextLabel !== specialDate.label
                ) {
                  void onSave({
                    id: specialDate.id,
                    date,
                    label: nextLabel,
                    color
                  });
                }
              }}
              autoFocus
            />
          </Field>

          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(event) => {
                const nextDate =
                  event.target.value;

                if (!nextDate) {
                  return;
                }

                setDate(nextDate);

                void onSave({
                  id: specialDate.id,
                  date: nextDate,
                  label:
                    label.trim() ||
                    specialDate.label,
                  color
                });
              }}
            />

            <span className="formatted-date-preview">
              {formatLongDate(date)}
            </span>
          </Field>

          <Field label="Highlight color">
            <ColorPalette
              value={color}
              onChange={(nextColor) => {
                setColor(nextColor);

                void onSave({
                  id: specialDate.id,
                  date,
                  label:
                    label.trim() ||
                    specialDate.label,
                  color: nextColor
                });
              }}
            />
          </Field>
        </div>

        <button
          className="danger-button full-width"
          onClick={() =>
            void onDelete(specialDate)
          }
        >
          Delete special date
        </button>
      </div>
    </aside>
  );
}

interface PanelHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
  backLabel?: string;
  onBack?: () => void;
}

function PanelHeader({
  eyebrow,
  title,
  onClose,
  backLabel,
  onBack
}: PanelHeaderProps) {
  return (
    <header className="panel-header">
      <div>
        {onBack && (
          <button
            type="button"
            data-panel-navigation="true"
            className="back-button"
            onClick={onBack}
          >
            ← {backLabel}
          </button>
        )}

        <span className="panel-eyebrow">
          {eyebrow}
        </span>

        <h2>{title}</h2>
      </div>

      <button
        className="panel-close"
        onClick={onClose}
        aria-label="Close side panel"
      >
        ×
      </button>
    </header>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({
  label,
  children
}: FieldProps) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface ColorPaletteProps {
  value: string;
  onChange: (color: string) => void;
}

function ColorPalette({
  value,
  onChange
}: ColorPaletteProps) {
  return (
    <div className="color-picker">
      <div className="color-row">
        <input
          type="color"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          aria-label="Choose a custom color"
        />

        <span>{value.toUpperCase()}</span>
      </div>

      <div
        className="color-palette"
        aria-label="Suggested colors"
      >
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={[
              "color-swatch",
              value.toLowerCase() ===
              color.toLowerCase()
                ? "color-swatch-selected"
                : ""
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              backgroundColor: color
            }}
            title={color}
            aria-label={`Use color ${color}`}
            onClick={() => onChange(color)}
          >
            {value.toLowerCase() ===
              color.toLowerCase() && (
              <span>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

const COLLAPSED_EMOJI_COUNT = 16;

function EmojiPicker({
  value,
  onChange
}: EmojiPickerProps) {
  const [expanded, setExpanded] =
    useState(false);

  const visibleEmojis = expanded
    ? PROJECT_EMOJIS
    : PROJECT_EMOJIS.slice(
        0,
        COLLAPSED_EMOJI_COUNT
      );

  const hiddenEmojiCount = Math.max(
    0,
    PROJECT_EMOJIS.length -
      COLLAPSED_EMOJI_COUNT
  );

  return (
    <div className="emoji-picker">
      <div
        className="emoji-palette"
        aria-label="Project emoji"
      >
        {visibleEmojis.map(
          (emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              className={[
                "emoji-option",
                value === emoji
                  ? "emoji-option-selected"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                onChange(emoji)
              }
              aria-label={`Use ${emoji}`}
              title={`Use ${emoji}`}
            >
              {emoji}
            </button>
          )
        )}
      </div>

      {hiddenEmojiCount > 0 && (
        <button
          type="button"
          className="emoji-expand-button"
          onClick={() =>
            setExpanded((current) => !current)
          }
          aria-expanded={expanded}
        >
          {expanded
            ? "Show fewer emojis"
            : `Show ${hiddenEmojiCount} more emojis`}
        </button>
      )}

      <label className="custom-emoji-field">
        <span>Custom emoji</span>

        <input
          value={value}
          maxLength={8}
          onChange={(event) => {
            const nextEmoji =
              event.target.value;

            if (nextEmoji) {
              onChange(nextEmoji);
            }
          }}
          placeholder="📌"
        />
      </label>
    </div>
  );
}

interface ConfettiParticle {
  id: number;
  startX: number;
  movementX: number;
  movementY: number;
  rotation: number;
  delay: number;
  duration: number;
  width: number;
  color: string;
}

function ConfettiBurst() {
  const particles =
    useMemo<ConfettiParticle[]>(
      () =>
        Array.from(
          {
            length: 24
          },
          (_, index) => ({
            id: index,
            startX:
              Math.random() * 90 - 45,
            movementX:
              Math.random() * 150 - 75,
            movementY:
              80 + Math.random() * 90,
            rotation:
              Math.random() * 720 - 360,
            delay:
              Math.random() * 110,
            duration:
              850 + Math.random() * 450,
            width:
              5 + Math.random() * 5,
            color:
              COLORS[
                index % COLORS.length
              ]
          })
        ),
      []
    );

  return (
    <div
      className="confetti-burst"
      aria-hidden="true"
    >
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="confetti-particle"
          style={
            {
              "--confetti-start-x":
                `${particle.startX}px`,
              "--confetti-x":
                `${particle.movementX}px`,
              "--confetti-y":
                `${particle.movementY}px`,
              "--confetti-rotation":
                `${particle.rotation}deg`,
              "--confetti-delay":
                `${particle.delay}ms`,
              "--confetti-duration":
                `${particle.duration}ms`,
              "--confetti-width":
                `${particle.width}px`,
              "--confetti-color":
                particle.color
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
