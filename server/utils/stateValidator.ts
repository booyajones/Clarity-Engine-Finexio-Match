/**
 * State validation and correction utilities
 * Ensures all state values are proper 2-3 character codes for API compatibility
 */

// Valid US state codes
const VALID_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', // District of Columbia
  // US Territories
  'AS', 'GU', 'MP', 'PR', 'VI', 'UM',
  // Military
  'AA', 'AE', 'AP',
  // Canadian provinces (for international support)
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
]);

// Common city-to-state mappings based on actual errors we've seen
const CITY_TO_STATE_MAP: Record<string, string> = {
  // Texas
  'DALLAS': 'TX',
  'HOUSTON': 'TX',
  'AUSTIN': 'TX',
  'SAN ANTONIO': 'TX',
  'FORT WORTH': 'TX',
  'EL PASO': 'TX',
  'ARLINGTON': 'TX',
  'PLANO': 'TX',
  
  // New York
  'NEW YORK': 'NY',
  'NEW YORK CITY': 'NY',
  'NYC': 'NY',
  'MANHATTAN': 'NY',
  'BROOKLYN': 'NY',
  'BUFFALO': 'NY',
  'ROCHESTER': 'NY',
  'YONKERS': 'NY',
  'SYRACUSE': 'NY',
  'ALBANY': 'NY',
  'PLAINVIEW': 'NY',
  
  // California
  'LOS ANGELES': 'CA',
  'SAN DIEGO': 'CA',
  'SAN JOSE': 'CA',
  'SAN FRANCISCO': 'CA',
  'FRESNO': 'CA',
  'SACRAMENTO': 'CA',
  'OAKLAND': 'CA',
  'LONG BEACH': 'CA',
  'PASADENA': 'CA',
  'SEBASTOPOL': 'CA',
  
  // Georgia
  'ATLANTA': 'GA',
  'AUGUSTA': 'GA',
  'COLUMBUS': 'GA',
  'SAVANNAH': 'GA',
  
  // Illinois
  'CHICAGO': 'IL',
  'AURORA': 'IL',
  'ROCKFORD': 'IL',
  'JOLIET': 'IL',
  'NAPERVILLE': 'IL',
  'SPRINGFIELD': 'IL',
  'PEORIA': 'IL',
  'CAROL STREAM': 'IL',
  'PALATINE': 'IL',
  
  // North Carolina
  'CHARLOTTE': 'NC',
  'RALEIGH': 'NC',
  'GREENSBORO': 'NC',
  'DURHAM': 'NC',
  'WINSTON-SALEM': 'NC',
  
  // Pennsylvania
  'PHILADELPHIA': 'PA',
  'PITTSBURGH': 'PA',
  'ALLENTOWN': 'PA',
  'ERIE': 'PA',
  'READING': 'PA',
  'ELVERSON': 'PA',
  
  // Missouri
  'KANSAS CITY': 'MO',
  'ST. LOUIS': 'MO',
  'ST LOUIS': 'MO',
  
  // New Jersey
  'NEWARK': 'NJ',
  'JERSEY CITY': 'NJ',
  'PATERSON': 'NJ',
  'ELIZABETH': 'NJ',
  'TRENTON': 'NJ',
  
  // New Hampshire
  'MANCHESTER': 'NH',
  'NASHUA': 'NH',
  'CONCORD': 'NH',
  'ROLLINSFORD': 'NH',
  
  // Other major cities
  'PHOENIX': 'AZ',
  'SEATTLE': 'WA',
  'BOSTON': 'MA',
  'DETROIT': 'MI',
  'DENVER': 'CO',
  'WASHINGTON': 'DC',
  'MIAMI': 'FL',
  'PORTLAND': 'OR',
  'LAS VEGAS': 'NV',
  'BALTIMORE': 'MD',
  'MILWAUKEE': 'WI',
  'ALBUQUERQUE': 'NM',
  'TUCSON': 'AZ',
  'NASHVILLE': 'TN',
  'MEMPHIS': 'TN',
  'LOUISVILLE': 'KY',
  'SALT LAKE CITY': 'UT',
  'HARTFORD': 'CT',
  'RICHMOND': 'VA',
  'NEW ORLEANS': 'LA',
  'HONOLULU': 'HI',
  'MINNEAPOLIS': 'MN',
  'CINCINNATI': 'OH',
  'CLEVELAND': 'OH',
  'INDIANAPOLIS': 'IN',
  'JACKSONVILLE': 'FL',
  'ORLANDO': 'FL',
  'TAMPA': 'FL'
};

/**
 * Validates and corrects a state value
 * @param state - The state value to validate/correct
 * @param city - Optional city value to help with correction
 * @returns Corrected state code or null if invalid and uncorrectable
 */
export function validateAndCorrectState(state: string | null | undefined, city?: string | null): string | null {
  // Handle null/undefined/empty
  if (!state || state.trim() === '') {
    return null;
  }

  const stateUpper = state.trim().toUpperCase();
  
  // If it's already a valid state code, return it
  if (VALID_STATE_CODES.has(stateUpper)) {
    return stateUpper;
  }
  
  // Check if it's a known city name that we can map to a state
  if (CITY_TO_STATE_MAP[stateUpper]) {
    console.log(`📍 Correcting state: "${state}" → "${CITY_TO_STATE_MAP[stateUpper]}" (detected city name)`);
    return CITY_TO_STATE_MAP[stateUpper];
  }
  
  // If the value is clearly not a state (too long, contains numbers, etc.)
  if (stateUpper.length > 20 || /\d/.test(stateUpper)) {
    // Check if we can use the city to determine state
    if (city) {
      const cityUpper = city.trim().toUpperCase();
      if (CITY_TO_STATE_MAP[cityUpper]) {
        console.log(`📍 Using city "${city}" to determine state: "${CITY_TO_STATE_MAP[cityUpper]}"`);
        return CITY_TO_STATE_MAP[cityUpper];
      }
    }
    console.warn(`⚠️ Invalid state value cannot be corrected: "${state}"`);
    return null;
  }
  
  // Handle common variations
  const variations: Record<string, string> = {
    'CALIF': 'CA',
    'CALIFORNIA': 'CA',
    'TEXAS': 'TX',
    'FLORIDA': 'FL',
    'NEW YORK STATE': 'NY',
    'PENN': 'PA',
    'PENNSYLVANIA': 'PA',
    'MASS': 'MA',
    'MASSACHUSETTS': 'MA',
    'WASH': 'WA',
    'WASHINGTON STATE': 'WA',
    'MICH': 'MI',
    'MICHIGAN': 'MI',
    'OHIO': 'OH',
    'ILLINOIS': 'IL',
    'VIRGINIA': 'VA',
    'NORTH CAROLINA': 'NC',
    'SOUTH CAROLINA': 'SC',
    'GEORGIA': 'GA',
    'ARIZONA': 'AZ',
    'MISSOURI': 'MO',
    'TENNESSEE': 'TN',
    'ALABAMA': 'AL',
    'LOUISIANA': 'LA',
    'KENTUCKY': 'KY',
    'OREGON': 'OR',
    'OKLAHOMA': 'OK',
    'CONNECTICUT': 'CT',
    'IOWA': 'IA',
    'MISSISSIPPI': 'MS',
    'ARKANSAS': 'AR',
    'KANSAS': 'KS',
    'UTAH': 'UT',
    'NEVADA': 'NV',
    'NEW MEXICO': 'NM',
    'WEST VIRGINIA': 'WV',
    'NEBRASKA': 'NE',
    'IDAHO': 'ID',
    'HAWAII': 'HI',
    'NEW HAMPSHIRE': 'NH',
    'MAINE': 'ME',
    'RHODE ISLAND': 'RI',
    'MONTANA': 'MT',
    'DELAWARE': 'DE',
    'SOUTH DAKOTA': 'SD',
    'NORTH DAKOTA': 'ND',
    'ALASKA': 'AK',
    'VERMONT': 'VT',
    'WYOMING': 'WY',
    'WISCONSIN': 'WI',
    'MINNESOTA': 'MN',
    'INDIANA': 'IN',
    'MARYLAND': 'MD',
    'COLORADO': 'CO',
    'NEW JERSEY': 'NJ'
  };
  
  if (variations[stateUpper]) {
    console.log(`📍 Correcting state: "${state}" → "${variations[stateUpper]}" (full state name)`);
    return variations[stateUpper];
  }
  
  // Last resort: check if it starts with a valid state code
  const validCodes = Array.from(VALID_STATE_CODES);
  for (const code of validCodes) {
    if (stateUpper.startsWith(code + ' ') || stateUpper.startsWith(code + '-')) {
      console.log(`📍 Extracting state code from: "${state}" → "${code}"`);
      return code;
    }
  }
  
  console.warn(`⚠️ Could not validate or correct state value: "${state}"`);
  return null;
}

/**
 * Validates a batch of records and returns statistics
 */
export function validateBatchStates(records: Array<{ state?: string | null, city?: string | null }>): {
  totalRecords: number;
  validStates: number;
  correctedStates: number;
  invalidStates: number;
  corrections: Array<{ original: string, corrected: string | null }>;
} {
  const stats = {
    totalRecords: records.length,
    validStates: 0,
    correctedStates: 0,
    invalidStates: 0,
    corrections: [] as Array<{ original: string, corrected: string | null }>
  };
  
  for (const record of records) {
    if (!record.state) {
      stats.invalidStates++;
      continue;
    }
    
    const original = record.state;
    const corrected = validateAndCorrectState(record.state, record.city);
    
    if (corrected === original.toUpperCase() && VALID_STATE_CODES.has(corrected)) {
      stats.validStates++;
    } else if (corrected) {
      stats.correctedStates++;
      stats.corrections.push({ original, corrected });
    } else {
      stats.invalidStates++;
      stats.corrections.push({ original, corrected: null });
    }
  }
  
  return stats;
}

/**
 * Check if a state value needs correction
 */
export function needsStateCorrection(state: string | null | undefined): boolean {
  if (!state) return false;
  const stateUpper = state.trim().toUpperCase();
  return !VALID_STATE_CODES.has(stateUpper);
}

export { VALID_STATE_CODES };