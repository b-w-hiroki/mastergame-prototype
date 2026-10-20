/** service_today RPC の日付から、claim_mission と同じ対象期間を求める。 */
export function missionPeriodKey(type: string, serviceDate: string): string {
  if (type !== 'weekly' && type !== 'daily') return 'once';
  const thursday = new Date(`${serviceDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || Number.isNaN(thursday.getTime())
    || thursday.toISOString().slice(0, 10) !== serviceDate) throw new Error('Invalid service date');
  if (type === 'daily') return serviceDate;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
