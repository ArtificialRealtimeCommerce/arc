-- ARC observatory schema. Idempotent.
create table if not exists indexer_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  agent_id numeric primary key,
  owner text not null,
  agent_uri text,
  registered_block bigint not null,
  registered_tx text not null,
  registered_at timestamptz not null default now()
);
create index if not exists agents_owner_idx on agents(owner);

create table if not exists feedback (
  id bigserial primary key,
  agent_id numeric not null,
  client text not null,
  score numeric not null,
  tag1 text,
  tag2 text,
  file_uri text,
  block bigint not null,
  tx text not null,
  log_index int not null,
  unique (tx, log_index)
);
create index if not exists feedback_agent_idx on feedback(agent_id);

create table if not exists jobs (
  job_id text primary key,
  client text not null,
  provider text not null,
  budget numeric not null,
  funded numeric not null default 0,
  paid numeric not null default 0,
  status text not null default 'created', -- created|funded|submitted|completed|disputed
  deliverable_uri text,
  created_block bigint not null,
  created_tx text not null,
  updated_block bigint not null
);
create index if not exists jobs_status_idx on jobs(status);
create index if not exists jobs_provider_idx on jobs(provider);

create table if not exists payments (
  id bigserial primary key,
  tx text not null,
  log_index int not null,
  block bigint not null,
  from_addr text not null,
  to_addr text not null,
  value numeric not null,
  kind text not null, -- transfer|x402 (x402 = AuthorizationUsed seen in same tx)
  ts timestamptz not null default now(),
  unique (tx, log_index)
);
create index if not exists payments_block_idx on payments(block desc);
create index if not exists payments_to_idx on payments(to_addr);
