"""Canonicalization rules for payee name normalization."""

import re
import unicodedata
from typing import Dict, List, Set
from metaphone import doublemetaphone
import structlog

logger = structlog.get_logger()

# Generic words to remove
GENERIC_WORDS = {
    'the', 'of', 'and', 'group', 'company', 'services', 
    'holdings', 'solutions', 'global', 'international',
    'enterprises', 'partners', 'associates', 'consulting'
}

# Corporate suffixes to remove (comprehensive list)
CORPORATE_SUFFIXES = {
    # US/UK
    'co', 'inc', 'incorporated', 'llc', 'l.l.c', 'llp', 'ltd', 'limited',
    'corp', 'corporation', 'plc', 'p.l.c', 'lp', 'l.p',
    
    # European
    'gmbh', 'bv', 'nv', 'sa', 'ag', 'oy', 'kk', 'srl', 'spa', 
    'pty', 'kft', 'sp z o.o', 's.a.', 's.a.s.', 'aps', 'ab', 'as', 
    'oyj', 'k.k.', 'bvba', 'e.k.', 'sarl', 'eurl', 'sas', 'snc',
    
    # Other
    'pty ltd', 'pvt ltd', 'private limited', 'public limited',
    'limitada', 'ltda', 'sl', 's.l.', 'cv', 'c.v.', 'de cv'
}

# Common abbreviations to expand
ABBREVIATIONS = {
    'intl': 'international',
    'natl': 'national',
    'assoc': 'associates',
    'mgmt': 'management',
    'svcs': 'services',
    'grp': 'group',
    'co': 'company',
    'corp': 'corporation',
    'inc': 'incorporated',
    'ltd': 'limited'
}


def remove_diacritics(text: str) -> str:
    """Remove diacritics from Unicode string."""
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join([c for c in nfkd if not unicodedata.combining(c)])


def canonicalize(name_raw: str) -> Dict[str, any]:
    """
    Canonicalize a payee name with deterministic rules.
    
    Returns:
        Dict with:
        - canon: canonicalized string
        - tokens: unique sorted tokens
        - dm_codes: double metaphone codes
    """
    if not name_raw or not name_raw.strip():
        return {
            "canon": "",
            "tokens": [],
            "dm_codes": []
        }
    
    # Start with lowercase
    text = name_raw.lower().strip()
    
    # Remove diacritics
    text = remove_diacritics(text)
    
    # Replace non-alphanumeric with space (keep & for companies like AT&T)
    text = re.sub(r'[^a-z0-9&\s]+', ' ', text)
    
    # Expand common abbreviations
    for abbr, full in ABBREVIATIONS.items():
        text = re.sub(rf'\b{abbr}\b', full, text)
    
    # Tokenize
    tokens = text.split()
    
    # Remove generic words and corporate suffixes
    tokens = [t for t in tokens 
              if t not in GENERIC_WORDS and t not in CORPORATE_SUFFIXES]
    
    # Handle special cases
    tokens = handle_special_cases(tokens)
    
    # Remove empty tokens and duplicates, then sort
    tokens = sorted(set(t for t in tokens if t))
    
    # Build canonical name
    canon = ' '.join(tokens)
    
    # Generate double metaphone codes for each token
    dm_codes = []
    for token in tokens:
        codes = doublemetaphone(token)
        dm_codes.extend([c for c in codes if c])
    
    # Remove duplicates from dm_codes
    dm_codes = list(set(dm_codes))
    
    return {
        "canon": canon,
        "tokens": tokens,
        "dm_codes": dm_codes
    }


def handle_special_cases(tokens: List[str]) -> List[str]:
    """Handle special cases in tokenization."""
    result = []
    
    for token in tokens:
        # Handle initials (e.g., "j.p." -> "jp")
        if re.match(r'^[a-z]\.([a-z]\.)*$', token):
            token = token.replace('.', '')
        
        # Handle hyphenated names
        if '-' in token and len(token) > 1:
            # Keep as is for now, but could split
            pass
        
        # Handle numbers at end (e.g., "company2" -> "company")
        # But keep pure numbers
        if re.match(r'^[a-z]+\d+$', token):
            token = re.sub(r'\d+$', '', token)
        
        result.append(token)
    
    return result


def is_exact_match(name1: str, name2: str) -> bool:
    """Fast path for exact matches after canonicalization."""
    canon1 = canonicalize(name1)["canon"]
    canon2 = canonicalize(name2)["canon"]
    return canon1 == canon2


def is_likely_initials(token: str) -> bool:
    """Check if a token looks like initials."""
    return len(token) <= 4 and token.isalpha() and token.isupper()


def extract_initials(tokens: List[str]) -> str:
    """Extract initials from tokens."""
    initials = []
    for token in tokens:
        if token and token[0].isalpha():
            initials.append(token[0].upper())
    return ''.join(initials)