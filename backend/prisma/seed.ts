/**
 * Development seed: the same sample catalogue, pharmacies and staff the frontend preview uses.
 * Safe to re-run — everything is upserted by a stable key.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PharmacyStatus, PrismaClient, ProductClass, Role } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const naira = (n: number) => n * 100;
const monthsFromNow = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + m, 28);
  d.setHours(0, 0, 0, 0);
  return d;
};

const products = [
  { slug: 'paracetamol-500', name: 'Paracetamol', genericName: 'Paracetamol', form: 'Tablet', strength: '500 mg', packDescription: '96 tablets', unitsPerPack: 96, manufacturer: 'Lagoon Pharma', category: 'Pain & fever', classification: ProductClass.OTC, storage: 'Below 30 °C, dry', uses: 'Pain, headache and fever' },
  { slug: 'ibuprofen-400', name: 'Ibuprofen', genericName: 'Ibuprofen', form: 'Tablet', strength: '400 mg', packDescription: '24 tablets', unitsPerPack: 24, manufacturer: 'Ashford Labs', category: 'Pain & fever', classification: ProductClass.OTC, storage: 'Below 25 °C', uses: 'Pain, inflammation and fever' },
  { slug: 'loratadine-10', name: 'Loratadine', genericName: 'Loratadine', form: 'Tablet', strength: '10 mg', packDescription: '30 tablets', unitsPerPack: 30, manufacturer: 'Ashford Labs', category: 'Allergy', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Allergies, hay fever and itching' },
  { slug: 'ors-sachets', name: 'Oral Rehydration Salts', genericName: 'ORS (low osmolarity)', form: 'Sachet', strength: '20.5 g', packDescription: '10 sachets', unitsPerPack: 10, manufacturer: 'Lagoon Pharma', category: 'Digestive', classification: ProductClass.OTC, storage: 'Below 30 °C, dry', uses: 'Dehydration from diarrhoea or vomiting' },
  { slug: 'vitamin-c-1000', name: 'Vitamin C', genericName: 'Ascorbic acid', form: 'Effervescent tablet', strength: '1000 mg', packDescription: '20 tablets', unitsPerPack: 20, manufacturer: 'Meridale Health', category: 'Vitamins', classification: ProductClass.OTC, storage: 'Below 25 °C, sealed', uses: 'Vitamin C supplement' },
  { slug: 'amoxicillin-500', name: 'Amoxicillin', genericName: 'Amoxicillin trihydrate', form: 'Capsule', strength: '500 mg', packDescription: 'Strip of 10', unitsPerPack: 10, manufacturer: 'Ashford Labs', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 25 °C', uses: 'Chest, ear, throat and urinary tract infections, and typhoid fever' },
  { slug: 'metformin-500', name: 'Metformin', genericName: 'Metformin hydrochloride', form: 'Tablet', strength: '500 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: 'Meridale Health', category: 'Diabetes care', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Type 2 diabetes' },
  { slug: 'amlodipine-5', name: 'Amlodipine', genericName: 'Amlodipine besilate', form: 'Tablet', strength: '5 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: 'Lagoon Pharma', category: 'Heart & blood pressure', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'High blood pressure and angina' },
  { slug: 'insulin-glargine-pen', name: 'Insulin glargine pen', genericName: 'Insulin glargine', form: 'Pre-filled pen', strength: '100 IU/ml · 3 ml', packDescription: '1 pen', unitsPerPack: 1, manufacturer: 'Kestrel Biologics', category: 'Diabetes care', classification: ProductClass.POM, coldChain: true, storage: '2–8 °C, do not freeze', uses: 'Diabetes — long-acting insulin' },
  { slug: 'salbutamol-inhaler', name: 'Salbutamol inhaler', genericName: 'Salbutamol sulfate', form: 'Metered-dose inhaler', strength: '100 mcg/dose', packDescription: '200 doses', unitsPerPack: 1, manufacturer: 'Kestrel Biologics', category: 'Respiratory', classification: ProductClass.POM, storage: 'Below 30 °C, away from heat', uses: 'Asthma and wheezing — reliever inhaler' },
  { slug: 'glucose-strips-50', name: 'Glucose test strips', genericName: 'Blood glucose strips', form: 'Test strip', strength: null, packDescription: '50 strips', unitsPerPack: 1, manufacturer: 'Northgate Medical', category: 'Diabetes care', classification: ProductClass.DEVICE, storage: '4–30 °C, sealed vial', uses: 'Checking blood sugar at home' },
  { slug: 'digital-thermometer', name: 'Digital thermometer', genericName: 'Clinical thermometer', form: 'Device', strength: null, packDescription: '1 unit', unitsPerPack: 1, manufacturer: 'Northgate Medical', category: 'Devices', classification: ProductClass.DEVICE, storage: 'Room temperature', uses: 'Checking body temperature' },
  // Sexual & reproductive health
  { slug: 'postinor-2', name: 'Postinor-2', genericName: 'Levonorgestrel (emergency contraceptive pill)', form: 'Tablet', strength: '0.75 mg', packDescription: '2 tablets', unitsPerPack: 2, manufacturer: 'Gedeon Richter', category: 'Sexual & reproductive health', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Emergency contraception — within 72 hours of unprotected sex' },
  { slug: 'gold-circle-condoms-3', name: 'Gold Circle condoms', genericName: 'Male latex condoms', form: 'Condom', strength: null, packDescription: '3 condoms', unitsPerPack: 3, manufacturer: 'Society for Family Health', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: 'Cool, dry place, away from sunlight', uses: 'Contraception and protection against STIs, including HIV' },
  { slug: 'fiesta-condoms-3', name: 'Fiesta condoms', genericName: 'Male latex condoms', form: 'Condom', strength: null, packDescription: '3 condoms', unitsPerPack: 3, manufacturer: 'DKT Nigeria', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: 'Cool, dry place, away from sunlight', uses: 'Contraception and protection against STIs, including HIV' },
  { slug: 'durex-condoms-3', name: 'Durex condoms', genericName: 'Male latex condoms', form: 'Condom', strength: null, packDescription: '3 condoms', unitsPerPack: 3, manufacturer: 'Reckitt', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: 'Cool, dry place, away from sunlight', uses: 'Contraception and protection against STIs, including HIV' },
  { slug: 'kiss-condoms-3', name: 'Kiss condoms', genericName: 'Male latex condoms', form: 'Condom', strength: null, packDescription: '3 condoms', unitsPerPack: 3, manufacturer: 'DKT Nigeria', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: 'Cool, dry place, away from sunlight', uses: 'Contraception and protection against STIs, including HIV' },
  // Combined pills need a health check (blood pressure, smoking, clot risk) first: prescription-only.
  { slug: 'microgynon-30', name: 'Microgynon 30', genericName: 'Combined oral contraceptive pill (levonorgestrel 150 mcg + ethinylestradiol 30 mcg)', form: 'Tablet', strength: '150/30 mcg', packDescription: '21 tablets (1 cycle)', unitsPerPack: 21, manufacturer: 'Bayer', category: 'Sexual & reproductive health', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Regular contraception — daily pill' },
  { slug: 'duofem', name: 'Duofem', genericName: 'Combined oral contraceptive pill (levonorgestrel 150 mcg + ethinylestradiol 30 mcg)', form: 'Tablet', strength: '150/30 mcg', packDescription: '28 tablets (1 cycle)', unitsPerPack: 28, manufacturer: '—', category: 'Sexual & reproductive health', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Regular contraception — daily pill' },
  { slug: 'p-test-strip', name: 'P-Test pregnancy test', genericName: 'Pregnancy test strip (hCG dipstick)', form: 'Test strip', strength: null, packDescription: '1 strip', unitsPerPack: 1, manufacturer: '—', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: '2–30 °C, sealed pouch', uses: 'Home pregnancy test' },
  { slug: 'clearblue-early-3', name: 'Clearblue Early Detection pregnancy test', genericName: 'Pregnancy test (hCG midstream)', form: 'Test', strength: null, packDescription: '3 tests', unitsPerPack: 3, manufacturer: 'SPD Swiss Precision Diagnostics', category: 'Sexual & reproductive health', classification: ProductClass.DEVICE, storage: '2–30 °C, sealed pouch', uses: 'Home pregnancy test — up to 6 days before a missed period' },
  // Pain relief: ketorolac is prescription-only, for short-term use
  { slug: 'ketolax-10', name: 'Ketolax', genericName: 'Ketorolac tromethamine', form: 'Tablet', strength: '10 mg', packDescription: '10 tablets', unitsPerPack: 10, manufacturer: '—', category: 'Pain & fever', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Short-term relief of moderate to severe pain — no more than 5 days' },
  { slug: 'ketolac-30-injection', name: 'Ketolac injection', genericName: 'Ketorolac tromethamine', form: 'Injection (ampoule)', strength: '30 mg/ml', packDescription: '1 ml ampoule', unitsPerPack: 1, manufacturer: '—', category: 'Pain & fever', classification: ProductClass.POM, storage: 'Below 30 °C, protect from light', uses: 'Short-term relief of moderate to severe pain — given by a health worker' },
  // Cough & cold
  { slug: 'oplex-syrup-100', name: 'Oplex cough syrup', genericName: 'Antitussive & expectorant (oxomemazine, guaifenesin, paracetamol, sodium benzoate)', form: 'Syrup', strength: null, packDescription: '100 ml bottle', unitsPerPack: 1, manufacturer: '—', category: 'Cough & cold', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Dry or chesty cough' },
  // Most-used medicines in Nigeria: malaria, antibiotics (incl. typhoid), vitamins, digestive, allergy, deworming, chronic care
  { slug: 'amatem-forte-softgel-6', name: 'Amatem Forte Softgel', genericName: 'Artemether + lumefantrine', form: 'Softgel capsule', strength: '80/480 mg', packDescription: '6 softgels', unitsPerPack: 6, manufacturer: 'Elbe Pharma Nigeria', category: 'Malaria', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Uncomplicated malaria in adults and children 35 kg and over — take with fatty food or milk' },
  { slug: 'amatem-softgel-12', name: 'Amatem Softgel', genericName: 'Artemether + lumefantrine', form: 'Softgel capsule', strength: '20/120 mg', packDescription: '12 softgels', unitsPerPack: 12, manufacturer: 'Elbe Pharma Nigeria', category: 'Malaria', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Uncomplicated malaria — dose by weight; take with fatty food or milk' },
  { slug: 'coartem-24', name: 'Coartem', genericName: 'Artemether + lumefantrine', form: 'Tablet', strength: '20/120 mg', packDescription: '24 tablets', unitsPerPack: 24, manufacturer: 'Novartis', category: 'Malaria', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Uncomplicated malaria — take with food or milk' },
  { slug: 'lonart-ds-6', name: 'Lonart DS', genericName: 'Artemether + lumefantrine', form: 'Tablet', strength: '80/480 mg', packDescription: '6 tablets', unitsPerPack: 6, manufacturer: 'Bliss GVS Pharma', category: 'Malaria', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Uncomplicated malaria in adults — take with food or milk' },
  { slug: 'p-alaxin-9', name: 'P-Alaxin', genericName: 'Dihydroartemisinin + piperaquine', form: 'Tablet', strength: '40/320 mg', packDescription: '9 tablets', unitsPerPack: 9, manufacturer: 'Bliss GVS Pharma', category: 'Malaria', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Uncomplicated malaria' },
  { slug: 'artesunate-60-injection', name: 'Artesunate injection', genericName: 'Artesunate', form: 'Injection (vial)', strength: '60 mg', packDescription: '1 vial with diluent', unitsPerPack: 1, manufacturer: '—', category: 'Malaria', classification: ProductClass.POM, storage: 'Below 30 °C, protect from light', uses: 'Severe malaria — given by a health worker' },
  { slug: 'sulfadoxine-pyrimethamine-3', name: 'Sulfadoxine-pyrimethamine', genericName: 'Sulfadoxine + pyrimethamine', form: 'Tablet', strength: '500/25 mg', packDescription: '3 tablets', unitsPerPack: 3, manufacturer: '—', category: 'Malaria', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Preventing malaria in pregnancy, given at antenatal care' },
  { slug: 'ciprofloxacin-500', name: 'Ciprofloxacin', genericName: 'Ciprofloxacin hydrochloride', form: 'Tablet', strength: '500 mg', packDescription: '10 tablets', unitsPerPack: 10, manufacturer: '—', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Typhoid fever, urinary tract infections and other bacterial infections' },
  { slug: 'augmentin-625', name: 'Augmentin', genericName: 'Amoxicillin + clavulanic acid', form: 'Tablet', strength: '625 mg', packDescription: '14 tablets', unitsPerPack: 14, manufacturer: 'GSK', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 25 °C, dry', uses: 'Chest, sinus, ear, skin and urinary tract infections' },
  { slug: 'ampiclox-500', name: 'Ampiclox', genericName: 'Ampicillin + cloxacillin', form: 'Capsule', strength: '500 mg', packDescription: '10 capsules', unitsPerPack: 10, manufacturer: 'Beecham (GSK)', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 25 °C', uses: 'Skin, wound and chest infections' },
  { slug: 'flagyl-400', name: 'Flagyl', genericName: 'Metronidazole', form: 'Tablet', strength: '400 mg', packDescription: '14 tablets', unitsPerPack: 14, manufacturer: 'Sanofi', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Amoebic dysentery, gut and dental infections, bacterial vaginosis and trichomoniasis' },
  { slug: 'azithromycin-500', name: 'Azithromycin', genericName: 'Azithromycin', form: 'Tablet', strength: '500 mg', packDescription: '3 tablets', unitsPerPack: 3, manufacturer: '—', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Chest, throat and skin infections, some STIs, and typhoid fever' },
  { slug: 'cefuroxime-500', name: 'Cefuroxime', genericName: 'Cefuroxime axetil', form: 'Tablet', strength: '500 mg', packDescription: '10 tablets', unitsPerPack: 10, manufacturer: '—', category: 'Antibiotics', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Chest, sinus, ear, skin and urinary tract infections' },
  { slug: 'panadol-extra', name: 'Panadol Extra', genericName: 'Paracetamol + caffeine', form: 'Tablet', strength: '500/65 mg', packDescription: '24 tablets', unitsPerPack: 24, manufacturer: 'Haleon', category: 'Pain & fever', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Headache, pain and fever' },
  { slug: 'aspirin-300', name: 'Aspirin', genericName: 'Acetylsalicylic acid', form: 'Tablet', strength: '300 mg', packDescription: '24 tablets', unitsPerPack: 24, manufacturer: '—', category: 'Pain & fever', classification: ProductClass.OTC, storage: 'Below 25 °C, dry', uses: 'Pain and fever in adults — not for under-16s' },
  { slug: 'diclofenac-50', name: 'Diclofenac', genericName: 'Diclofenac sodium', form: 'Tablet', strength: '50 mg', packDescription: '20 tablets', unitsPerPack: 20, manufacturer: '—', category: 'Pain & fever', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Pain and inflammation — joints, back and period pain' },
  { slug: 'multivitamin-30', name: 'Multivitamin', genericName: 'Multivitamins and minerals', form: 'Tablet', strength: null, packDescription: '30 tablets', unitsPerPack: 30, manufacturer: '—', category: 'Vitamins', classification: ProductClass.OTC, storage: 'Below 25 °C, dry', uses: 'Daily vitamin and mineral supplement' },
  { slug: 'vitamin-b-complex', name: 'Vitamin B complex', genericName: 'Vitamin B complex', form: 'Tablet', strength: null, packDescription: '30 tablets', unitsPerPack: 30, manufacturer: '—', category: 'Vitamins', classification: ProductClass.OTC, storage: 'Below 25 °C, dry', uses: 'Vitamin B supplement' },
  { slug: 'folic-acid-5', name: 'Folic acid', genericName: 'Folic acid', form: 'Tablet', strength: '5 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Vitamins', classification: ProductClass.OTC, storage: 'Below 25 °C', uses: 'Before and during pregnancy, and folate-deficiency anaemia' },
  { slug: 'ferrous-sulphate-200', name: 'Ferrous sulphate', genericName: 'Ferrous sulphate (iron)', form: 'Tablet', strength: '200 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Vitamins', classification: ProductClass.OTC, storage: 'Below 25 °C, dry', uses: 'Iron-deficiency anaemia' },
  { slug: 'magnesium-trisilicate', name: 'Magnesium trisilicate compound', genericName: 'Magnesium trisilicate + aluminium hydroxide', form: 'Chewable tablet', strength: null, packDescription: '50 tablets', unitsPerPack: 50, manufacturer: '—', category: 'Digestive', classification: ProductClass.OTC, storage: 'Below 30 °C, dry', uses: 'Heartburn and indigestion' },
  { slug: 'omeprazole-20', name: 'Omeprazole', genericName: 'Omeprazole', form: 'Capsule', strength: '20 mg', packDescription: '14 capsules', unitsPerPack: 14, manufacturer: '—', category: 'Digestive', classification: ProductClass.OTC, storage: 'Below 25 °C, dry', uses: 'Stomach ulcers, acid reflux and heartburn' },
  { slug: 'zinc-20-dispersible', name: 'Zinc', genericName: 'Zinc sulphate', form: 'Dispersible tablet', strength: '20 mg', packDescription: '10 tablets', unitsPerPack: 10, manufacturer: '—', category: 'Digestive', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Diarrhoea in children, given with ORS' },
  { slug: 'loperamide-2', name: 'Loperamide', genericName: 'Loperamide hydrochloride', form: 'Capsule', strength: '2 mg', packDescription: '12 capsules', unitsPerPack: 12, manufacturer: '—', category: 'Digestive', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Short-term diarrhoea in adults — not for children or bloody diarrhoea' },
  { slug: 'piriton-4', name: 'Piriton', genericName: 'Chlorphenamine maleate', form: 'Tablet', strength: '4 mg', packDescription: '30 tablets', unitsPerPack: 30, manufacturer: 'Haleon', category: 'Allergy', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Allergies, hay fever, itching and rashes — may cause drowsiness' },
  { slug: 'cetirizine-10', name: 'Cetirizine', genericName: 'Cetirizine hydrochloride', form: 'Tablet', strength: '10 mg', packDescription: '10 tablets', unitsPerPack: 10, manufacturer: '—', category: 'Allergy', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Allergies, hay fever and itching' },
  { slug: 'benylin-original-100', name: 'Benylin Original', genericName: 'Cough syrup (diphenhydramine, ammonium chloride, sodium citrate, menthol; codeine-free)', form: 'Syrup', strength: null, packDescription: '100 ml bottle', unitsPerPack: 1, manufacturer: 'Kenvue', category: 'Cough & cold', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Cough and chest congestion — may cause drowsiness' },
  { slug: 'zentel-400', name: 'Zentel', genericName: 'Albendazole', form: 'Tablet', strength: '400 mg', packDescription: '1 tablet', unitsPerPack: 1, manufacturer: 'GSK', category: 'Deworming', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Worms — deworming for adults and children over 2' },
  { slug: 'vermox-100', name: 'Vermox', genericName: 'Mebendazole', form: 'Tablet', strength: '100 mg', packDescription: '6 tablets', unitsPerPack: 6, manufacturer: 'Janssen', category: 'Deworming', classification: ProductClass.OTC, storage: 'Below 30 °C', uses: 'Worms — deworming' },
  { slug: 'nifedipine-20-retard', name: 'Nifedipine retard', genericName: 'Nifedipine', form: 'Modified-release tablet', strength: '20 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Heart & blood pressure', classification: ProductClass.POM, storage: 'Below 25 °C, protect from light', uses: 'High blood pressure and angina' },
  { slug: 'lisinopril-10', name: 'Lisinopril', genericName: 'Lisinopril', form: 'Tablet', strength: '10 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Heart & blood pressure', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'High blood pressure and heart failure' },
  { slug: 'losartan-50', name: 'Losartan', genericName: 'Losartan potassium', form: 'Tablet', strength: '50 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Heart & blood pressure', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'High blood pressure' },
  { slug: 'hydrochlorothiazide-25', name: 'Hydrochlorothiazide', genericName: 'Hydrochlorothiazide', form: 'Tablet', strength: '25 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Heart & blood pressure', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'High blood pressure and fluid retention' },
  { slug: 'glibenclamide-5', name: 'Glibenclamide', genericName: 'Glibenclamide', form: 'Tablet', strength: '5 mg', packDescription: '28 tablets', unitsPerPack: 28, manufacturer: '—', category: 'Diabetes care', classification: ProductClass.POM, storage: 'Below 30 °C', uses: 'Type 2 diabetes' },
  // Present so the API's controlled-medicine guard can be exercised; never listed or sold.
  { slug: 'tramadol-50', name: 'Tramadol', genericName: 'Tramadol hydrochloride', form: 'Capsule', strength: '50 mg', packDescription: '10 capsules', unitsPerPack: 10, manufacturer: 'Sample', category: 'Pain & fever', classification: ProductClass.CONTROLLED, storage: 'Secure storage' },
];

const pharmacies = [
  { slug: 'oakfield-ikeja', name: 'Oakfield Pharmacy', area: 'Ikeja GRA', address: '12 Isaac John Street, Ikeja GRA, Lagos', premisesLicenceNo: 'SAMPLE-PCN-0001', licenceExpiresAt: monthsFromNow(1), coldChain: true, lat: 6.5833, lng: 3.355, factor: 1 },
  { slug: 'unity-surulere', name: 'Unity Pharmacy', area: 'Surulere', address: '40 Adeniran Ogunsanya Street, Surulere, Lagos', premisesLicenceNo: 'SAMPLE-PCN-0002', licenceExpiresAt: monthsFromNow(9), coldChain: false, lat: 6.493, lng: 3.357, factor: 0.95 },
  { slug: 'marina-yaba', name: 'Marina Health Pharmacy', area: 'Yaba', address: '3 Herbert Macaulay Way, Yaba, Lagos', premisesLicenceNo: 'SAMPLE-PCN-0003', licenceExpiresAt: monthsFromNow(14), coldChain: true, lat: 6.503, lng: 3.378, factor: 1.06 },
];

const basePrice: Record<string, number> = {
  'paracetamol-500': 1200, 'ibuprofen-400': 1850, 'loratadine-10': 2400, 'ors-sachets': 600, 'vitamin-c-1000': 3100,
  'amoxicillin-500': 950, 'metformin-500': 2200, 'amlodipine-5': 1950, 'insulin-glargine-pen': 18500, 'salbutamol-inhaler': 4800,
  'glucose-strips-50': 9500, 'digital-thermometer': 3500,
  'postinor-2': 1500, 'gold-circle-condoms-3': 400, 'fiesta-condoms-3': 600, 'durex-condoms-3': 1800,
  'kiss-condoms-3': 500, 'microgynon-30': 3000, 'duofem': 900, 'p-test-strip': 200, 'clearblue-early-3': 6000,
  'amatem-forte-softgel-6': 3500, 'amatem-softgel-12': 2500, 'coartem-24': 4500, 'lonart-ds-6': 3000, 'p-alaxin-9': 3500, 'artesunate-60-injection': 1500, 'sulfadoxine-pyrimethamine-3': 600, 'ciprofloxacin-500': 1500, 'augmentin-625': 9500, 'ampiclox-500': 2500, 'flagyl-400': 2000, 'azithromycin-500': 2000, 'cefuroxime-500': 4500, 'panadol-extra': 1000, 'aspirin-300': 500, 'diclofenac-50': 800, 'multivitamin-30': 1500, 'vitamin-b-complex': 800, 'folic-acid-5': 500, 'ferrous-sulphate-200': 700, 'magnesium-trisilicate': 900, 'omeprazole-20': 1200, 'zinc-20-dispersible': 800, 'loperamide-2': 700, 'piriton-4': 1200, 'cetirizine-10': 900, 'benylin-original-100': 2500, 'zentel-400': 1500, 'vermox-100': 1800, 'nifedipine-20-retard': 1500, 'lisinopril-10': 2500, 'losartan-50': 3000, 'hydrochlorothiazide-25': 1200, 'glibenclamide-5': 1000,
  'ketolax-10': 1600, 'ketolac-30-injection': 700, 'oplex-syrup-100': 2300,
};

const staff = [
  { phone: '+2348030000001', firstName: 'Adaeze', lastName: 'Okafor', role: Role.PHARMACIST, pharmacy: 'oakfield-ikeja' },
  { phone: '+2348030000002', firstName: 'Sola', lastName: 'Lawal', role: Role.PHARMACY_STAFF, pharmacy: 'oakfield-ikeja' },
  { phone: '+2348030000003', firstName: 'Tunde', lastName: 'Bakare', role: Role.PHARMACIST, pharmacy: 'unity-surulere' },
  { phone: '+2348030000009', firstName: 'Platform', lastName: 'Admin', role: Role.PLATFORM_ADMIN, pharmacy: null },
];

const riders = [
  { phone: '+2348030000011', firstName: 'Tunde', lastName: 'Ojo', partner: 'Swift Courier (sample)', coldChain: true },
  { phone: '+2348030000012', firstName: 'Bisi', lastName: 'Kalu', partner: 'Swift Courier (sample)', coldChain: false },
  { phone: '+2348030000013', firstName: 'Musa', lastName: 'Dauda', partner: 'Metro Dispatch (sample)', coldChain: false },
];

async function main() {
  const productIds: Record<string, string> = {};
  for (const p of products) {
    const row = await prisma.product.upsert({ where: { slug: p.slug }, update: p, create: p });
    productIds[p.slug] = row.id;
  }

  for (const { factor, ...ph } of pharmacies) {
    const pharmacy = await prisma.pharmacy.upsert({
      where: { slug: ph.slug },
      update: { ...ph, status: PharmacyStatus.VERIFIED },
      create: { ...ph, status: PharmacyStatus.VERIFIED },
    });

    for (const [slug, price] of Object.entries(basePrice)) {
      if (slug === 'insulin-glargine-pen' && !ph.coldChain) continue;
      if (slug === 'vitamin-c-1000' && ph.slug === 'unity-surulere') continue;
      // Two batches of amoxicillin at Oakfield so FEFO allocation is visible: the sooner one is dispensed first.
      const batches = ph.slug === 'oakfield-ikeja' && slug === 'amoxicillin-500'
        ? [{ n: 'AMX-2309-114', months: 5, qty: 14 }, { n: 'AMX-2405-201', months: 18, qty: 40 }]
        : [{ n: `${slug.slice(0, 3).toUpperCase()}-${ph.slug.slice(0, 3).toUpperCase()}-01`, months: 12 + (slug.length % 9), qty: 25 }];
      for (const b of batches) {
        await prisma.batch.upsert({
          where: { pharmacyId_productId_batchNumber: { pharmacyId: pharmacy.id, productId: productIds[slug], batchNumber: b.n } },
          update: { quantity: b.qty, priceKobo: naira(Math.round((price * factor) / 50) * 50), expiresAt: monthsFromNow(b.months), status: 'SALEABLE', quarantineReason: null },
          create: { pharmacyId: pharmacy.id, productId: productIds[slug], batchNumber: b.n, quantity: b.qty, priceKobo: naira(Math.round((price * factor) / 50) * 50), expiresAt: monthsFromNow(b.months), location: 'Shelf A1' },
        });
      }
    }
  }

  for (const s of staff) {
    const pharmacyId = s.pharmacy ? (await prisma.pharmacy.findUniqueOrThrow({ where: { slug: s.pharmacy } })).id : null;
    const data = { firstName: s.firstName, lastName: s.lastName, role: s.role, pharmacyId, consentAt: new Date() };
    await prisma.user.upsert({ where: { phone: s.phone }, update: data, create: { phone: s.phone, ...data } });
  }

  // Sample couriers from a partner logistics company. Sign in at /rider with these numbers.
  for (const r of riders) {
    const data = { firstName: r.firstName, lastName: r.lastName, role: Role.RIDER, pharmacyId: null, consentAt: new Date() };
    const user = await prisma.user.upsert({ where: { phone: r.phone }, update: data, create: { phone: r.phone, ...data } });
    const profile = { partner: r.partner, coldChain: r.coldChain };
    await prisma.riderProfile.upsert({ where: { userId: user.id }, update: profile, create: { userId: user.id, ...profile } });
  }

  const counts = await Promise.all([prisma.product.count(), prisma.pharmacy.count(), prisma.batch.count(), prisma.user.count()]);
  console.log(`Seeded ${counts[0]} products, ${counts[1]} pharmacies, ${counts[2]} batches, ${counts[3]} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
