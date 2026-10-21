import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeEvent, Ticket } from "./domain.js";

export class RuntimeStore {
  readonly root: string;
  readonly ticketsPath: string;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(root = resolve(process.env.AGENTDECK_DATA_DIR ?? ".agentdeck-data/runtime")) {
    this.root = root;
    this.ticketsPath = resolve(root, "tickets.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      await readFile(this.ticketsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.writeTickets([]);
    }
  }

  async listTickets(): Promise<Ticket[]> {
    await this.initialize();
    return JSON.parse(await readFile(this.ticketsPath, "utf8")) as Ticket[];
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    return (await this.listTickets()).find((ticket) => ticket.id === id);
  }

  async saveTicket(ticket: Ticket): Promise<void> {
    await this.exclusive(async () => {
      const tickets = await this.listTickets();
      const index = tickets.findIndex((item) => item.id === ticket.id);
      if (index === -1) tickets.push(ticket);
      else tickets[index] = ticket;
      await this.writeTickets(tickets);
    });
  }

  async createTicket(text: string, scenario?: Ticket["scenario"]): Promise<Ticket> {
    const id = `tkt_${randomUUID()}`;
    const ticket: Ticket = {
      id,
      text,
      ...(scenario ? { scenario } : {}),
      createdAt: new Date().toISOString(),
      status: "created",
      eventsFile: `tickets/${id}/events.jsonl`,
    };
    await mkdir(resolve(this.root, "tickets", id), { recursive: true });
    await this.saveTicket(ticket);
    await this.appendEvent(ticket, "ticket.created", "system", { scenario: scenario ?? null, text });
    return ticket;
  }

  async appendEvent(ticket: Ticket, type: string, role: RuntimeEvent["role"], data: Record<string, unknown>): Promise<RuntimeEvent> {
    const path = resolve(this.root, ticket.eventsFile);
    await mkdir(dirname(path), { recursive: true });
    const previous = await this.readEvents(ticket);
    const event: RuntimeEvent = { id: (previous.at(-1)?.id ?? 0) + 1, ticket_id: ticket.id, at: new Date().toISOString(), type, ...(role ? { role } : {}), data };
    await appendFile(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    return event;
  }

  async readEvents(ticket: Ticket, after = 0): Promise<RuntimeEvent[]> {
    try {
      const content = await readFile(resolve(this.root, ticket.eventsFile), "utf8");
      return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as RuntimeEvent).filter((event) => event.id > after);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeTickets(tickets: Ticket[]): Promise<void> {
    const tempPath = `${this.ticketsPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(tickets, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, this.ticketsPath);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolveNext) => { release = resolveNext; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
