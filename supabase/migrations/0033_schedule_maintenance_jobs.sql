-- Production maintenance schedules.
--
-- Supabase provides pg_cron, while the plain PostgreSQL image used by CI does
-- not. Keep the migration portable: install and configure jobs only when the
-- extension is available. Reapplying the setup is idempotent because existing
-- jobs with the same names are removed before the canonical schedules are set.

do $migration$
declare
  v_job record;
  v_job_count integer;
  v_job_names text[] := array[
    'notify-expiring-points',
    'expire-points',
    'process-deletions',
    'purge-events',
    'accrue-staking-monthly'
  ];
begin
  if not exists (
    select 1 from pg_available_extensions where name = 'pg_cron'
  ) then
    raise notice 'pg_cron is unavailable; maintenance schedules were skipped';
    return;
  end if;

  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    execute 'create extension pg_cron with schema pg_catalog';
  end if;

  if to_regclass('cron.job') is null then
    raise exception 'pg_cron is installed but cron.job is unavailable';
  end if;

  for v_job in
    execute 'select jobid from cron.job where jobname = any($1)'
      using v_job_names
  loop
    execute 'select cron.unschedule($1)' using v_job.jobid;
  end loop;

  execute $sql$
    select cron.schedule(
      'notify-expiring-points',
      '10 0 * * *',
      'select public.notify_expiring_points()'
    )
  $sql$;

  execute $sql$
    select cron.schedule(
      'expire-points',
      '20 0 * * *',
      'select public.expire_points(false)'
    )
  $sql$;

  execute $sql$
    select cron.schedule(
      'process-deletions',
      '30 0 * * *',
      'select public.process_account_deletions(false)'
    )
  $sql$;

  execute $sql$
    select cron.schedule(
      'purge-events',
      '40 0 * * *',
      'select public.purge_app_events(false)'
    )
  $sql$;

  execute $sql$
    select cron.schedule(
      'accrue-staking-monthly',
      '10 0 1 * *',
      $command$select public.accrue_staking(date_trunc('month', now())::date)$command$
    )
  $sql$;

  execute 'select count(*) from cron.job where active and jobname = any($1)'
    into v_job_count
    using v_job_names;

  if v_job_count <> cardinality(v_job_names) then
    raise exception 'expected % active maintenance jobs, found %',
      cardinality(v_job_names), v_job_count;
  end if;
end
$migration$;
