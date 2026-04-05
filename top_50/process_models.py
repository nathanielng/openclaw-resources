#!/usr/bin/env python3
"""
Process OpenRouter models and PinchBench data:
1. Fetch OpenRouter API models
2. Merge with PinchBench benchmark data
3. Generate top 50 models by Avg %
"""

import urllib.request
import csv
import json
import re
import subprocess
from typing import List, Dict, Any

# ============================================================================
# SECTION 1: Fetch OpenRouter Models
# ============================================================================

def fetch_models() -> List[Dict[str, Any]]:
    """Fetch models from OpenRouter API"""
    url = "https://openrouter.ai/api/v1/models"

    # Try using curl as fallback
    try:
        result = subprocess.run(['curl', '-s', url], capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return data.get('data', [])
    except (FileNotFoundError, subprocess.CalledProcessError):
        # Fallback to urllib with SSL context
        import ssl
        ssl_context = ssl._create_unverified_context()
        with urllib.request.urlopen(url, context=ssl_context) as response:
            data = json.loads(response.read().decode())
        return data.get('data', [])

def extract_pricing(pricing_dict: Dict) -> tuple:
    """Extract input and output pricing from pricing object"""
    if not pricing_dict:
        return None, None

    input_price = pricing_dict.get('prompt')
    output_price = pricing_dict.get('completion')
    return input_price, output_price

def models_to_csv(models: List[Dict], output_file: str = 'openrouter_models.csv'):
    """Convert models list to CSV"""
    fieldnames = [
        'Model ID',
        'Name',
        'Input Price (per token)',
        'Output Price (per token)',
        'Context Length',
        'Modalities',
        'Provider',
        'Description'
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for model in models:
            input_price, output_price = extract_pricing(model.get('pricing', {}))

            row = {
                'Model ID': model.get('id', ''),
                'Name': model.get('name', ''),
                'Input Price (per token)': input_price if input_price else '',
                'Output Price (per token)': output_price if output_price else '',
                'Context Length': model.get('context_length', ''),
                'Modalities': ', '.join(model.get('architecture', {}).get('modality', [])) if model.get('architecture') else '',
                'Provider': model.get('owner', ''),
                'Description': model.get('description', '')
            }
            writer.writerow(row)

    return output_file

# ============================================================================
# SECTION 2: Merge with PinchBench
# ============================================================================

def clean_model_id(model_str: str) -> str:
    """Remove emojis and extra whitespace from model string"""
    # Remove emoji and other unicode characters
    model_str = re.sub(r'[^\w/\-:.]', '', model_str)
    return model_str.strip()

def read_pinchbench(filepath: str) -> Dict[str, Dict]:
    """Read pinchbench.csv and return dict keyed by model ID"""
    models = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row and row.get('Model'):
                model_id = clean_model_id(row['Model'])
                if model_id:
                    models[model_id] = {
                        'Provider': row.get('Provider', ''),
                        'Best %': row.get('Best %', ''),
                        'Avg %': row.get('Avg %', '')
                    }
    return models

def read_openrouter(filepath: str) -> Dict[str, Dict]:
    """Read openrouter_models.csv and return dict keyed by model ID"""
    models = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row and row.get('Model ID'):
                model_id = row['Model ID'].strip()
                models[model_id] = {
                    'Name': row.get('Name', ''),
                    'Input Price (per token)': row.get('Input Price (per token)', ''),
                    'Output Price (per token)': row.get('Output Price (per token)', ''),
                    'Context Length': row.get('Context Length', ''),
                    'Modalities': row.get('Modalities', ''),
                    'OpenRouter Provider': row.get('Provider', '')
                }
    return models

def merge_models(pinch: Dict, openrouter: Dict) -> List[Dict]:
    """Merge the two model dicts"""
    # Get all model IDs from both sources
    all_model_ids = set(pinch.keys()) | set(openrouter.keys())

    merged = []
    for model_id in sorted(all_model_ids):
        row = {'Model ID': model_id}

        # Add pinchbench data if available
        if model_id in pinch:
            row.update(pinch[model_id])
        else:
            row['Provider'] = ''
            row['Best %'] = ''
            row['Avg %'] = ''

        # Add openrouter data if available
        if model_id in openrouter:
            row.update(openrouter[model_id])
        else:
            row['Name'] = ''
            row['Input Price (per token)'] = ''
            row['Output Price (per token)'] = ''
            row['Context Length'] = ''
            row['Modalities'] = ''
            row['OpenRouter Provider'] = ''

        merged.append(row)

    return merged

def write_merged(merged: List[Dict], output_file: str = 'merged_models.csv'):
    """Write merged data to CSV"""
    if not merged:
        print("No models to write")
        return

    fieldnames = [
        'Model ID',
        'Name',
        'Provider',
        'Best %',
        'Avg %',
        'Input Price (per token)',
        'Output Price (per token)',
        'Context Length',
        'Modalities',
        'OpenRouter Provider'
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(merged)

    return output_file

# ============================================================================
# SECTION 3: Create Top 50
# ============================================================================

def convert_price_to_per_million(price_str: str) -> str:
    """Convert price per token to price per million tokens"""
    if not price_str or price_str == '':
        return ''
    try:
        price = float(price_str)
        price_per_million = price * 1_000_000
        return str(price_per_million)
    except ValueError:
        return ''

def create_top50(merged: List[Dict]) -> List[Dict]:
    """Create top 50 models from merged data"""
    # Filter out models with empty Avg %
    models_with_avg = [m for m in merged if m.get('Avg %', '').strip()]

    # Sort by Avg % descending
    models_with_avg.sort(
        key=lambda x: float(x['Avg %'].replace('%', '').strip()),
        reverse=True
    )

    # Take top 50
    top_50 = models_with_avg[:50]

    # Process each model
    processed = []
    for model in top_50:
        processed_model = {
            'Model ID': model['Model ID'],
            'Best %': model['Best %'],
            'Avg %': model['Avg %'],
            'Input Price (per M tokens)': convert_price_to_per_million(
                model.get('Input Price (per token)', '')
            ),
            'Output Price (per M tokens)': convert_price_to_per_million(
                model.get('Output Price (per token)', '')
            )
        }
        processed.append(processed_model)

    return processed

def write_top50(models: List[Dict], output_file: str = 'top50_models.csv'):
    """Write top 50 to CSV"""
    if not models:
        print("No models to write")
        return

    fieldnames = [
        'Model ID',
        'Best %',
        'Avg %',
        'Input Price (per M tokens)',
        'Output Price (per M tokens)'
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(models)

    return output_file

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("="*100)
    print("PROCESSING OPENROUTER MODELS AND PINCHBENCH DATA")
    print("="*100)

    # Step 1: Fetch OpenRouter models
    print("\n[1/5] Fetching OpenRouter models...")
    models = fetch_models()
    print(f"✓ Found {len(models)} models")

    # Step 2: Save OpenRouter models to CSV
    print("\n[2/5] Saving OpenRouter models...")
    models_to_csv(models)
    print("✓ Saved to openrouter_models.csv")

    # Step 3: Merge with PinchBench
    print("\n[3/5] Merging with PinchBench data...")
    pinch = read_pinchbench('pinchbench.csv')
    print(f"✓ Found {len(pinch)} models in pinchbench.csv")
    openrouter = read_openrouter('openrouter_models.csv')
    print(f"✓ Found {len(openrouter)} models in openrouter_models.csv")
    merged = merge_models(pinch, openrouter)
    print(f"✓ Merged to {len(merged)} unique models")

    # Step 4: Write merged models
    print("\n[4/5] Writing merged models...")
    write_merged(merged)
    print("✓ Saved to merged_models.csv")

    # Step 5: Create and write top 50
    print("\n[5/5] Creating top 50 models...")
    top_50 = create_top50(merged)
    write_top50(top_50)
    print(f"✓ Saved to top50_models.csv")

    # Print summary
    print("\n" + "="*100)
    print("TOP 50 MODELS (SORTED BY AVG %)")
    print("="*100)
    for i, model in enumerate(top_50, 1):
        print(f"{i:2d}. {model['Model ID']:<40} Best: {model['Best %']:<8} Avg: {model['Avg %']:<8}")

    print("\n" + "="*100)
    print("✓ COMPLETE: Generated merged_models.csv and top50_models.csv")
    print("="*100)
