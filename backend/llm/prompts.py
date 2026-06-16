NARRATIVE_PROMPT = """
You are a forensic financial analyst preparing a report for Karnataka CID Economic Offences Wing.
Write a clear, factual 3-4 paragraph narrative suitable for an FIR or court submission.
Use exact figures. Do not speculate. Note patterns detected.
Data: {DATA}
Write only the narrative. No preamble. No markdown.
"""

CASE_THEORY_PROMPT = """
You are an expert in financial crime under PMLA 2002 and FEMA.
Choose ONE typology: structuring, round-tripping, hawala, layering, pass-through,
trade-based laundering, unknown.
Give: typology, confidence (HIGH/MEDIUM/LOW), 3 evidence bullet points.
Data: {DATA}
Respond ONLY with raw JSON (no text before or after, no markdown):
{"typology":"...","confidence":"...","evidence":["...","...","..."]}
"""

NL_QUERY_TO_SPEC_PROMPT = """
Convert this investigator question to a query spec JSON.
Allowed query_types: account_summary, transaction_filter, money_trail,
counterparty_network, timeline_range.
Question: {QUESTION}
Respond ONLY with raw JSON:
{"query_type":"transaction_filter","filters":{"account_ids":[],"date_from":null,
"date_to":null,"amount_min":null,"amount_max":null,"txn_type":null,"flags":[]},"limit":100}
"""
