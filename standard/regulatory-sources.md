# Verified regulatory source text

Every quotation below was retrieved and read during this build. Nothing here is
recalled from memory. Where a source could only be reached through a secondary
publisher rather than the primary gazette text, that is marked, because the
difference matters for how much weight a rule can carry.

Retrieved 2026-09-06.

---

## 1. ASCI Code, Chapter I: Truthful and Honest Representation

**Primary.** Retrieved from the ASCI Codes and Guidelines Book PDF
(ascionline.in), Chapter I, page 09. Code signed by the Chairman, Board of
Governors, ASCI, 21 April 2022.

> **1.1.** Advertisements must be truthful. All descriptions, claims and
> comparisons, which relate to matters of objectively ascertainable fact, should
> be capable of substantiation. Advertisers and advertising agencies are
> required to produce such substantiation as and when called upon to do so by
> The Advertising Standards Council of India.

> **1.2.** Where advertising claims are expressly stated to be based on, or
> supported by independent research or assessment, its source and date should be
> indicated in the advertisement.

> **1.4.** Advertisements shall neither distort facts nor mislead the consumer by
> means of implications or omissions.

**Chapter titles, confirmed from the Code's own index:**

| Chapter | Title |
|---|---|
| I | Truthful & Honest Representation |
| II | Non-offensive to Public |
| III | Against Harmful Products/Services/Situations |
| IV | Fair in Competition |

**Correction on record:** the seed rulebook cited "ASCI Code chapter II
(substantiation)". That is wrong. Chapter II governs offensiveness to public
decency. Substantiation is Chapter I, clause 1.1. See `docs/CORRECTIONS.md`.

---

## 2. ASCI Code, Chapter IV: Fair in Competition

**Primary.** Same source, page 15. Governs comparative claims.

> **4.1.** Advertisements containing comparisons with other manufacturers or
> suppliers, or with other products, including those where a competitor is
> named, are permissible in the interests of vigorous competition and public
> enlightenment, provided:
> (a) It is clear what aspects of the advertiser's product are being compared
> with what aspects of the competitor's product.
> (b) The subject matter of comparison is not chosen in such a way as to confer
> an artificial advantage upon the advertiser or so as to suggest that a better
> bargain is offered than is truly the case.
> (c) The comparisons are factual, accurate and capable of substantiation.
> (d) There is no likelihood of the consumer being misled as a result of the
> comparison, whether about the product advertised or that with which it is
> compared.
> (e) The advertisement does not unfairly denigrate, attack or discredit other
> products, advertisers or advertisements directly or by implication.

---

## 3. ASCI Guideline: Usage of Awards/Rankings in Advertisements

**Primary.** Same source, page 39 onward. Directly relevant to any "India's
No.1" or "award-winning" claim.

> **7.** To substantiate the award/ranking claim, the advertiser needs to give an
> undertaking that there is no commercial relationship or conflict of interest
> between the awarding organisation/the research agency/jury members and the
> advertiser, and that they are two independent entities. To be specific, there
> should be no direct or indirect payment made by the advertiser to the
> institution or organisation granting such award.

> **8.** [...] i. The criteria for granting award/ranking, which should be
> published and available in the public domain. ii. The process followed, i.e.,
> either via market research or by a panel decision.

Also relevant: an award or ranking given in one category cannot be used to
promote in another category.

---

## 4. ASCI Guideline: Advertising for Skin Lightening or Fairness Improvement Products

**Primary.** Same source, page 35. Dated 14 August 2014.

This is category-specific and applies directly to any brightening, pigmentation,
or tone-correction product in the Minimalist range.

> **1)** Advertising should not communicate any discrimination as a result of
> skin colour. These advertisements should not reinforce negative social
> stereotyping on the basis of skin colour. Specifically, advertising should not
> directly or implicitly show people with darker skin, in a way which is widely
> seen as, unattractive, unhappy, depressed or concerned. These advertisement
> should not portray people with darker skin, in a way which is widely seen as,
> at a disadvantage of any kind, or inferior, or unsuccessful in any aspect of
> life, particularly in relation to being attractive to the opposite sex,
> matrimony, job placement, promotions and other prospects.

> **2)** In the pre-usage depiction of product, special care should be taken to
> ensure that the expression of the models in the real and graphical
> representation should not be negative in a way which is widely seen as
> unattractive, unhappy, depressed or concerned.

> **3)** Advertising should not associate darker or lighter colour skin with any
> particular socio-economic strata, caste, community, religion, profession or
> ethnicity.

> **4)** Advertising should not perpetuate gender-based discrimination because of
> skin colour.

**Why this matters for our tool:** guideline 2 constrains *imagery*, not just
copy. A generated "before" background showing dissatisfied darker skin would
violate this. This is the clearest evidence that generated backgrounds have to
be scored rather than treated as decoration.

---

## 5. Drugs and Magic Remedies (Objectionable Advertisements) Act 1954, Section 3

**Primary.** Retrieved from indiankanoon.org/doc/358950/, cross-checked against
the India Code listing.

> **3. Prohibition of advertisement of certain drugs for treatment of certain
> diseases and disorders.** Subject to the provisions of this Act, no person
> shall take any part in the publication of any advertisement referring to any
> drug in terms which suggest or are calculated to lead to the use of that drug
> for
> (a) the procurement of miscarriage in women or prevention of conception in
> women; or
> (b) the maintenance or improvement of the capacity of human beings for sexual
> pleasure; or
> (c) the correction of menstrual disorder in women; or
> (d) the diagnosis, cure, mitigation, treatment or prevention of any disease,
> disorder or condition specified in the Schedule, or any other disease,
> disorder or condition (by whatsoever name called) which may be specified in
> the rules made under this Act

**Definition of "drug" under s.2(b), which is broader than the ordinary sense:**

> a medicine for internal or external use of human beings or animals; any
> substance intended for diagnosis, cure, mitigation, treatment or prevention of
> disease; any article affecting structure or organic function of the body; any
> component of such medicines

### The Schedule, and what it does NOT contain

The Schedule lists 54 diseases, disorders and conditions. **Acne, pimples,
pigmentation, dark spots, wrinkles, skin ageing and dandruff do not appear
anywhere in it.**

The only skin-adjacent entries are **Leucoderma**, **Lupus**, and **Trachoma**.

**Correction on record:** the seed rulebook grounded a "cures acne" prohibition
in this Act's Schedule. That grounding is wrong. An acne cure claim is not a
Schedule offence. See `docs/CORRECTIONS.md`.

**What survives, and it is sharper than what we started with:** a brightening or
pigmentation product that strays into claiming to treat **leucoderma** or
vitiligo *would* engage s.3(d). For a brand selling Alpha Arbutin, that is a
narrow, real, and specific exposure rather than a generic one.

---

## 6. Cosmetics Rules 2020, Rule 36

**Secondary.** The CDSCO and drugscontrol.org PDF hosts both returned HTTP 403
to automated retrieval. The wording below is consistently reproduced across
CDSCO-derived materials and legal commentary, but we did not read the gazette
text directly. Treat as strong but not primary-verified.

> **Prohibition against false or misleading claims.** No cosmetic may purport or
> claim to purport or convey any idea that is false or misleading to the
> intending user.

This, not the D&MR Act, is the correct general anchor for false-claim rules on a
cosmetic.

---

## 7. CDSCO public notice on the cosmetic/drug boundary

**Secondary.** Reported by GlobalCosing/ChemRadar. Notice dated 18 May 2026,
File No. COS-1211/2026-eoffice. Not read in the original.

> Cosmetics may only be used for their intended purposes, cleansing,
> beautifying, promoting attractiveness, or altering appearance. They shall not
> be used for therapeutic or medical treatment by professionals or individuals.

This is the live mechanism behind a cure claim: it is not that "cure" is a banned
word, it is that a therapeutic claim reclassifies the product out of the cosmetic
category and into drug licensing. CDSCO has acted on this recently, including
cancelling an import registration over inconsistencies between label claims and
website claims.

---

## Retrieval failures, recorded honestly

| Source | Outcome |
|---|---|
| indiacode.nic.in D&MR PDF | HTTP 403 |
| drugscontrol.org Cosmetics Rules 2020 PDF | HTTP 403 |
| drugscontrol.py.gov.in D&MR PDF | TLS certificate verification failure |
| CCPA Guidelines 2022, primary gazette text | Not retrieved. Commentary only. No rule currently depends on it. |

No rule in this repo cites a source that appears only in the failure table above.
