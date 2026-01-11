/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC)
 * This prevents timezone issues where dates shift by one day
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // If already a full ISO string with time, just parse it
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  
  // For YYYY-MM-DD format, parse as local date
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return new Date(dateString);
  
  return new Date(year, month - 1, day);
}
