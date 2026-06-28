import unittest
from decimal import Decimal
from datetime import datetime
from parsers.shared.amount_parser import parse_amount, resolve_txn_type
from parsers.shared.date_parser import parse_date, is_skip_row


class TestBankParserUtilities(unittest.TestCase):

    def test_amount_parsing_robustness(self):
        # Clean amount string
        self.assertEqual(parse_amount("1,23,456.78"), Decimal("123456.78"))
        self.assertEqual(parse_amount("12,34,567.89"), Decimal("1234567.89"))
        self.assertEqual(parse_amount(" Rs. 15,000.00 Cr "), Decimal("15000.00"))
        
        # Parentheses (negative)
        self.assertEqual(parse_amount("(1,234.56)"), Decimal("-1234.56"))
        self.assertEqual(parse_amount(" (₹ 15,200.50) "), Decimal("-15200.50"))
        
        # Standard cleaning
        self.assertEqual(parse_amount("- 100.50"), Decimal("-100.50"))
        self.assertEqual(parse_amount("1.234.567,89"), Decimal("1234567.89"))  # European format

        # Zero amount check
        self.assertEqual(parse_amount("0"), Decimal("0"))
        self.assertEqual(parse_amount("0.00"), Decimal("0.00"))
        self.assertEqual(parse_amount(""), None)
        self.assertEqual(parse_amount("abc"), None)

    def test_resolve_txn_type(self):
        # Debit only
        self.assertEqual(resolve_txn_type(Decimal("500.00"), None), (Decimal("500.00"), "DR"))
        self.assertEqual(resolve_txn_type(Decimal("500.00"), Decimal("0.00")), (Decimal("500.00"), "DR"))
        # Credit only
        self.assertEqual(resolve_txn_type(None, Decimal("250.50")), (Decimal("250.50"), "CR"))
        self.assertEqual(resolve_txn_type(Decimal("0.00"), Decimal("250.50")), (Decimal("250.50"), "CR"))
        # Both zero or None
        self.assertEqual(resolve_txn_type(None, None), (None, None))
        self.assertEqual(resolve_txn_type(Decimal("0.00"), Decimal("0.00")), (None, None))

    def test_date_parsing_robustness(self):
        self.assertEqual(parse_date("25-Apr-25"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25/Apr/25"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25-Apr-2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25/Apr/2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25 Apr 2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25 April 2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25-04-2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25/04/2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25/04/25"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("2025-04-25"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25.04.2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25.04.25"), datetime(2025, 4, 25))
        
        # Test time strip
        self.assertEqual(parse_date("25-Apr-25 14:32:11"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("25/Apr/2025 09:15"), datetime(2025, 4, 25))

        # Test weekday strip
        self.assertEqual(parse_date("Mon, 25-Apr-2025"), datetime(2025, 4, 25))
        self.assertEqual(parse_date("Sun 25-Apr-25"), datetime(2025, 4, 25))

        # Test space normalization before year (e.g. 06-APR- 2025)
        self.assertEqual(parse_date("06-APR- 2025"), datetime(2025, 4, 6))
        self.assertEqual(parse_date("06-APR- 25"), datetime(2025, 4, 6))

        # Test generic parser parse_date
        from parsers.generic_parser import parse_date as parse_date_generic
        self.assertEqual(parse_date_generic("06-APR- 2025"), datetime(2025, 4, 6))
        # Ensure it doesn't return year 1900 for 2-part dates (defaults to current year)
        self.assertEqual(parse_date_generic("06-APR").year, datetime.now().year)

    def test_is_skip_row(self):
        self.assertTrue(is_skip_row("25-Apr-25", "B/F"))
        self.assertTrue(is_skip_row("25-Apr-25", "Opening Balance"))
        self.assertTrue(is_skip_row("25-Apr-25", "balance b/f"))
        self.assertFalse(is_skip_row("25-Apr-25", "UPI/123456789/Salary"))

    def test_entity_extraction_from_narration(self):
        from entity.extractor import extract_entities_from_narration

        # Case 1: Cheque Deposit
        res1 = extract_entities_from_narration("BB/CHQ DEP/106171/02-04-2025/HARDIK/ AXIS BANK LTD")
        self.assertEqual(res1.get("account_numbers"), ["106171"])
        self.assertEqual(res1.get("counterparty_name"), "HARDIK")
        self.assertEqual(res1.get("counterparty_bank"), "AXIS BANK LTD")

        # Case 2: ATM Withdrawal
        res2 = extract_entities_from_narration("ATM-NFS/CASH WITHDRAWAL/PIRANGUT IAD PIRANGUT MH IN/511111001892/SELF")
        self.assertEqual(res2.get("account_numbers"), ["511111001892"])
        # 'SELF' and 'CASH WITHDRAWAL' are ignored, leaving PIRANGUT location or empty

        # Case 3: IMPS
        res3 = extract_entities_from_narration("IMPS-OPM/511111933048/HARDIK LALIT MEHTA/UTIB0000004/0269/")
        self.assertEqual(res3.get("account_numbers"), ["511111933048"])
        self.assertEqual(res3.get("counterparty_name"), "HARDIK LALIT MEHTA")
        self.assertEqual(res3.get("counterparty_bank"), "Axis Bank")

        # Case 4: NEFT
        res4 = extract_entities_from_narration("NEFT/IDFBH25111255559/AANYA VERMA MEHTA/UTIB0000004")
        self.assertEqual(res4.get("account_numbers"), ["IDFBH25111255559"])
        self.assertEqual(res4.get("counterparty_name"), "AANYA VERMA MEHTA")
        self.assertEqual(res4.get("counterparty_bank"), "Axis Bank")

    def test_detect_bank(self):
        from parsers.router import detect_bank

        # Case 1: Filename override
        self.assertEqual(detect_bank("statement_hdfc_2025.pdf", "some text"), "hdfc")
        self.assertEqual(detect_bank("AxisStatement.pdf", "some text"), "axis")

        # Case 2: Header IFSC code resolution
        first_page_text = """
        STATEMENT OF ACCOUNT
        CUSTOMER ID: 5401557030
        IFSC Code: IDFB0041359
        ACCOUNT TYPE: Gold
        BB/CHQ DEP/106171/02-04-2025/HARDIK/ AXIS BANK LTD
        """
        # Even though "AXIS BANK LTD" is in the text, it should resolve to "idfc" because of IDFB0041359
        self.assertEqual(detect_bank("statement.pdf", first_page_text), "idfc")

        # Case 3: Keyword override with protection against transaction noise
        first_page_text_no_ifsc = """
        STAR RETAIL LLP
        GROUND FLOOR, SOLITAIRE APARTMENT, PUNE MH IN
        IDFC FIRST BANK LTD
        BB/CHQ DEP/106171/02-04-2025/HARDIK/ AXIS BANK LTD
        """
        self.assertEqual(detect_bank("statement.pdf", first_page_text_no_ifsc), "idfc")


if __name__ == "__main__":
    unittest.main()
