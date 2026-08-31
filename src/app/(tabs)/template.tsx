import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShareNodeIcon } from '@/components/home-icons';
import { LabelPreview, LABEL_PAD_STAGE_MIN_HEIGHT } from '@/components/label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { useLabelStore } from '@/stores/label-store';
import { useTranslation } from '@/lib/i18n';

interface CategoryGroup {
  header: string;
  items: string[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  { header: 'Popular', items: ['Popular'] },
  { header: 'General', items: ['General', 'Multi-UP', 'Cable', 'Circle', 'Other'] },
  { header: 'Retail', items: ['Jewelry', 'Supermarket', 'Clothing', 'Food', 'Appliances'] },
  { header: 'Household', items: ['Storage'] },
  { header: 'Office', items: ['File', 'Asset', 'School'] },
  { header: 'Warehouse', items: ['Material', 'Racking'] },
  { header: 'Medicine', items: ['Laboratory'] },
];

interface TemplateItem {
  id: string;
  name: string;
  nameLine2?: string;
  dimensions: string;
  category: string;
  width: number;
  height: number;
  previewType:
    | 'macaroon'
    | 'cartoon'
    | 'watercolor'
    | 'color-pill'
    // --- GENERAL ---
    | 'rect-30x22'
    | 'rect-35x15'
    | 'rect-40x15'
    | 'rect-40x80'
    | 'rect-50x20'
    | 'rect-50x25'
    | 'rect-50x70'
    | 'rect-60x38'
    | 'rect-60x80'
    | 'rect-65x35'
    | 'dual-stacked-20x10'
    | 'dual-cols-20x10'
    | 'dual-stacked-30x15'
    | 'dual-cols-30x30'
    | 'dual-cols-22.5x13'
    | 'two-ups-30x20'
    | 'two-ups-40x25'
    | 'three-ups-25x15'
    | 'three-ups-30x20'
    | 'four-ups-20x15'
    // --- CABLE ---
    | 'cable-yellow-4col'
    | 'cable-12.5x74'
    | 'cable-301-pstyle'
    | 'cable-428-inspected'
    | 'cable-tall-dual-flag'
    | 'cable-d38-inverted'
    | 'cable-gp60-hangtag'
    | 'cable-hb38-red'
    | 'cable-lf45-double'
    | 'cable-lf64-dash'
    | 'cable-lt38-tstyle'
    | 'cable-lt45-tstyle'
    | 'cable-pstyle-barcode'
    | 'cable-pstyle-panel23'
    | 'cable-tstyle-barcode'
    // --- OTHER (29 items translated into clean English) ---
    | 'other-8x60-5rows'
    | 'other-15x25-rect'
    | 'other-19x13-rect'
    | 'other-50x10-plus4'
    | 'other-storage-bag-v1'
    | 'other-storage-bag-v2'
    | 'other-storage-bag-v3'
    | 'other-storage-bag-v4'
    | 'other-storage-bag-v5'
    | 'other-storage-bag-v6'
    | 'other-storage-bag-v7'
    | 'other-fishing-50x30-simple'
    | 'other-fishing-50x70-tall'
    | 'other-fishing-70x50-park'
    | 'other-fishing-70x50-hotline'
    | 'other-fishing-80x50-qr1'
    | 'other-fishing-80x50-qr2'
    | 'other-fabric-50x70-remark'
    | 'other-fabric-50x70-table'
    | 'other-fabric-70x50-simple'
    | 'other-fabric-70x50-spec'
    | 'other-fabric-70x50-company'
    | 'other-fabric-70x50-rows'
    | 'other-barcode-library'
    | 'other-barcode-apparel'
    | 'other-barcode-elementary'
    | 'other-service-card-warranty'
    | 'other-service-water-filter'
    | 'other-service-equipment'
    // --- OTHER MISC ---
    | 'transparent-30x20'
    | 'transparent-40x20'
    | 'circle-30'
    | 'circle-40'
    | 'circle-50'
    // --- JEWELRY ---
    | 'jew-dumbell-13x85'
    | 'jew-dumbell-15x85'
    | 'jew-hangtag-159x413'
    | 'jew-label-20x20-right'
    | 'jew-label-20x20-left'
    | 'jew-label-50x13-horizontal'
    | 'jew-label-50x13-yellow'
    | 'jew-sample-25x30-flower'
    | 'jew-sample-30x25-stacked'
    | 'jew-sample-30x25-pattern'
    | 'jew-sample-50x15-holes'
    | 'jew-sample-50x19-tabs'
    | 'jew-sample-53x14-bar'
    | 'jew-rattail-143x635'
    // --- SUPERMARKET ---
    | 'smkt-black-yellow-60x40'
    | 'smkt-orange-50x30'
    | 'smkt-yellow-40x30'
    | 'smkt-shelf-50x30-1'
    | 'smkt-shelf-50x30-2'
    | 'smkt-twocolor-50x30'
    | 'smkt-black-yellow-40x30'
    | 'smkt-red-40x30'
    | 'smkt-black-75x38'
    | 'smkt-black-green-60x40'
    | 'smkt-sale-talker-635x984'
    | 'smkt-shelf-84x30-cvs'
    | 'smkt-shelf-84x30-bbq'
    | 'smkt-shelf-84x30-2'
    // --- FOOD ---
    | 'food-baked-30x15'
    | 'food-price-496x296'
    | 'food-imported-60x50'
    | 'food-ingredients-50x40'
    // --- APPLIANCES ---
    | 'appl-electrical-40x20'
    // --- STORAGE LABELS ---
    | 'storage-home-50x20'
    | 'storage-kitchen-cabinet-101x51'
    | 'storage-kitchen-vanilla-44x32'
    // --- FILE ---
    | 'file-address-667x254'
    | 'file-cabinet-52x169'
    | 'file-folder-192x61'
    | 'file-label-40x25a'
    | 'file-label-40x25b'
    | 'file-visitor-968x54'
    // --- ASSET ---
    | 'asset-tag-508x19'
    | 'asset-tag-6985x3175'
    | 'asset-tag-9525x508-1'
    | 'asset-tag-9525x508-2'
    // --- SCHOOL ---
    | 'school-name-sticker-40x25a'
    | 'school-name-sticker-40x25b'
    // --- MATERIAL ---
    | 'material-label-445x14'
    | 'material-label-61x508'
    | 'material-label-70x222'
    | 'material-label-80x40'
    // --- RACKING ---
    | 'rack-label-80x40'
    | 'rack-label-100x40'
    // --- LABORATORY ---
    | 'lab-label-508x37'
    | 'lab-microscope-22x22'
    | 'lab-pathology-508x19';
}

const TEMPLATES: TemplateItem[] = [
  // --- POPULAR ---
  {
    id: 'pop-1',
    name: '101-Macaroon-30x15',
    dimensions: '30 x 15',
    category: 'Popular',
    width: 30,
    height: 15,
    previewType: 'macaroon',
  },
  {
    id: 'pop-2',
    name: '102-Cartoon-30x15',
    dimensions: '30 x 15',
    category: 'Popular',
    width: 30,
    height: 15,
    previewType: 'cartoon',
  },
  {
    id: 'pop-3',
    name: '104-Color-40x20',
    dimensions: '40 x 20',
    category: 'Popular',
    width: 40,
    height: 20,
    previewType: 'watercolor',
  },
  {
    id: 'pop-4',
    name: '105-Color-50x15',
    dimensions: '50 x 15',
    category: 'Popular',
    width: 50,
    height: 15,
    previewType: 'color-pill',
  },

  // --- GENERAL (15 items in exact order as screenshots) ---
  {
    id: 'gen-1',
    name: '30x22',
    dimensions: '30 x 22',
    category: 'General',
    width: 30,
    height: 22,
    previewType: 'rect-30x22',
  },
  {
    id: 'gen-2',
    name: '35x15',
    dimensions: '35 x 15',
    category: 'General',
    width: 35,
    height: 15,
    previewType: 'rect-35x15',
  },
  {
    id: 'gen-3',
    name: '40x15',
    dimensions: '40 x 15',
    category: 'General',
    width: 40,
    height: 15,
    previewType: 'rect-40x15',
  },
  {
    id: 'gen-4',
    name: '40x80',
    dimensions: '40 x 80',
    category: 'General',
    width: 40,
    height: 80,
    previewType: 'rect-40x80',
  },
  {
    id: 'gen-5',
    name: '50x20',
    dimensions: '50 x 20',
    category: 'General',
    width: 50,
    height: 20,
    previewType: 'rect-50x20',
  },
  {
    id: 'gen-6',
    name: '50x25',
    dimensions: '50 x 25',
    category: 'General',
    width: 50,
    height: 25,
    previewType: 'rect-50x25',
  },
  {
    id: 'gen-7',
    name: '50x70',
    dimensions: '50 x 70',
    category: 'General',
    width: 50,
    height: 70,
    previewType: 'rect-50x70',
  },
  {
    id: 'gen-8',
    name: '60x38',
    dimensions: '60 x 38',
    category: 'General',
    width: 60,
    height: 38,
    previewType: 'rect-60x38',
  },
  {
    id: 'gen-9',
    name: '60x80',
    dimensions: '60 x 80',
    category: 'General',
    width: 60,
    height: 80,
    previewType: 'rect-60x80',
  },
  {
    id: 'gen-10',
    name: '65x35',
    dimensions: '65 x 35',
    category: 'General',
    width: 65,
    height: 35,
    previewType: 'rect-65x35',
  },
  {
    id: 'gen-11',
    name: 'D20x10',
    dimensions: '20 x 20',
    category: 'General',
    width: 20,
    height: 20,
    previewType: 'dual-stacked-20x10',
  },
  {
    id: 'gen-12',
    name: 'D20x10',
    dimensions: '41 x 10',
    category: 'General',
    width: 41,
    height: 10,
    previewType: 'dual-cols-20x10',
  },
  {
    id: 'gen-13',
    name: 'D30x15',
    dimensions: '30 x 30',
    category: 'General',
    width: 30,
    height: 30,
    previewType: 'dual-stacked-30x15',
  },
  {
    id: 'gen-14',
    name: 'D30x30',
    dimensions: '30 x 30',
    category: 'General',
    width: 30,
    height: 30,
    previewType: 'dual-cols-30x30',
  },
  {
    id: 'gen-15',
    name: "Two UP's-22.5x13",
    dimensions: '48 x 13',
    category: 'General',
    width: 48,
    height: 13,
    previewType: 'dual-cols-22.5x13',
  },
  {
    id: 'mup-1',
    name: "2 UP's-30x20",
    dimensions: '62 x 20',
    category: 'Multi-UP',
    width: 62,
    height: 20,
    previewType: 'two-ups-30x20',
  },
  {
    id: 'mup-2',
    name: "2 UP's-40x25",
    dimensions: '82 x 25',
    category: 'Multi-UP',
    width: 82,
    height: 25,
    previewType: 'two-ups-40x25',
  },
  {
    id: 'mup-3',
    name: "3 UP's-25x15",
    dimensions: '78 x 15',
    category: 'Multi-UP',
    width: 78,
    height: 15,
    previewType: 'three-ups-25x15',
  },
  {
    id: 'mup-4',
    name: "3 UP's-30x20",
    dimensions: '94 x 20',
    category: 'Multi-UP',
    width: 94,
    height: 20,
    previewType: 'three-ups-30x20',
  },
  {
    id: 'mup-5',
    name: "4 UP's-20x15",
    dimensions: '86 x 15',
    category: 'Multi-UP',
    width: 86,
    height: 15,
    previewType: 'four-ups-20x15',
  },

  // --- CABLE (15 items in exact order as screenshots) ---
  {
    id: 'cab-1',
    name: '10x20-Yellow-4-column',
    dimensions: '40 x 20',
    category: 'Cable',
    width: 40,
    height: 20,
    previewType: 'cable-yellow-4col',
  },
  {
    id: 'cab-2',
    name: '12.5x74+35-P0',
    dimensions: '109 x 12.5',
    category: 'Cable',
    width: 109,
    height: 12.5,
    previewType: 'cable-12.5x74',
  },
  {
    id: 'cab-3',
    name: '301-Cable',
    nameLine2: 'Label-38x25+40',
    dimensions: '78 x 25',
    category: 'Cable',
    width: 78,
    height: 25,
    previewType: 'cable-301-pstyle',
  },
  {
    id: 'cab-4',
    name: 'Cable',
    nameLine2: 'Label-44.5x25.4+25.5',
    dimensions: '70 x 25.4',
    category: 'Cable',
    width: 70,
    height: 25.4,
    previewType: 'cable-428-inspected',
  },
  {
    id: 'cab-5',
    name: 'Cable Label-46x70',
    dimensions: '46 x 70',
    category: 'Cable',
    width: 46,
    height: 70,
    previewType: 'cable-tall-dual-flag',
  },
  {
    id: 'cab-6',
    name: 'D38x25+38',
    dimensions: '76 x 35',
    category: 'Cable',
    width: 76,
    height: 35,
    previewType: 'cable-d38-inverted',
  },
  {
    id: 'cab-7',
    name: 'GP60x45',
    dimensions: '60 x 45',
    category: 'Cable',
    width: 60,
    height: 45,
    previewType: 'cable-gp60-hangtag',
  },
  {
    id: 'cab-8',
    name: 'HB38x25+38',
    dimensions: '76 x 25',
    category: 'Cable',
    width: 76,
    height: 25,
    previewType: 'cable-hb38-red',
  },
  {
    id: 'cab-9',
    name: 'LF45x30+50',
    dimensions: '95 x 30',
    category: 'Cable',
    width: 95,
    height: 30,
    previewType: 'cable-lf45-double',
  },
  {
    id: 'cab-10',
    name: 'LF64x32+35',
    dimensions: '99 x 32',
    category: 'Cable',
    width: 99,
    height: 32,
    previewType: 'cable-lf64-dash',
  },
  {
    id: 'cab-11',
    name: 'LT38x25+30',
    dimensions: '38 x 55',
    category: 'Cable',
    width: 38,
    height: 55,
    previewType: 'cable-lt38-tstyle',
  },
  {
    id: 'cab-12',
    name: 'LT45x30+40',
    dimensions: '45 x 70',
    category: 'Cable',
    width: 45,
    height: 70,
    previewType: 'cable-lt45-tstyle',
  },
  {
    id: 'cab-13',
    name: 'P-Style Cable',
    nameLine2: 'Label-30x25+40',
    dimensions: '70 x 25',
    category: 'Cable',
    width: 70,
    height: 25,
    previewType: 'cable-pstyle-barcode',
  },
  {
    id: 'cab-14',
    name: 'P-Style Cable',
    nameLine2: 'Label-38.1x40.6+21.9',
    dimensions: '64 x 40.6',
    category: 'Cable',
    width: 64,
    height: 40.6,
    previewType: 'cable-pstyle-panel23',
  },
  {
    id: 'cab-15',
    name: 'T-Style Cable',
    nameLine2: 'Label-30x19.8+15.2',
    dimensions: '30 x 35',
    category: 'Cable',
    width: 30,
    height: 35,
    previewType: 'cable-tstyle-barcode',
  },

  // --- OTHER (29 items in exact serial order from screenshots, translated to clean English) ---
  {
    id: 'oth-1',
    name: '8x60-5 Rows',
    dimensions: '60 x 40',
    category: 'Other',
    width: 60,
    height: 40,
    previewType: 'other-8x60-5rows',
  },
  {
    id: 'oth-2',
    name: '15x25',
    dimensions: '15 x 25',
    category: 'Other',
    width: 15,
    height: 25,
    previewType: 'other-15x25-rect',
  },
  {
    id: 'oth-3',
    name: '19x13',
    dimensions: '19 x 13',
    category: 'Other',
    width: 19,
    height: 13,
    previewType: 'other-19x13-rect',
  },
  {
    id: 'oth-4',
    name: '50x10+4',
    dimensions: '50 x 14',
    category: 'Other',
    width: 50,
    height: 14,
    previewType: 'other-50x10-plus4',
  },
  {
    id: 'oth-5',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v1',
  },
  {
    id: 'oth-6',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v2',
  },
  {
    id: 'oth-7',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v3',
  },
  {
    id: 'oth-8',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v4',
  },
  {
    id: 'oth-9',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v5',
  },
  {
    id: 'oth-10',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v6',
  },
  {
    id: 'oth-11',
    name: 'Storage Bag Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-storage-bag-v7',
  },
  {
    id: 'oth-12',
    name: 'Fishing Spot Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-fishing-50x30-simple',
  },
  {
    id: 'oth-13',
    name: 'Fishing Spot Label',
    dimensions: '50 x 70',
    category: 'Other',
    width: 50,
    height: 70,
    previewType: 'other-fishing-50x70-tall',
  },
  {
    id: 'oth-14',
    name: 'Fishing Spot Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fishing-70x50-park',
  },
  {
    id: 'oth-15',
    name: 'Fishing Spot Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fishing-70x50-hotline',
  },
  {
    id: 'oth-16',
    name: 'Fishing Spot Label',
    dimensions: '80 x 50',
    category: 'Other',
    width: 80,
    height: 50,
    previewType: 'other-fishing-80x50-qr1',
  },
  {
    id: 'oth-17',
    name: 'Fishing Spot Label',
    dimensions: '80 x 50',
    category: 'Other',
    width: 80,
    height: 50,
    previewType: 'other-fishing-80x50-qr2',
  },
  {
    id: 'oth-18',
    name: 'Fabric Composition Label',
    dimensions: '50 x 70',
    category: 'Other',
    width: 50,
    height: 70,
    previewType: 'other-fabric-50x70-remark',
  },
  {
    id: 'oth-19',
    name: 'Fabric Composition Label',
    dimensions: '50 x 70',
    category: 'Other',
    width: 50,
    height: 70,
    previewType: 'other-fabric-50x70-table',
  },
  {
    id: 'oth-20',
    name: 'Fabric Composition Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fabric-70x50-simple',
  },
  {
    id: 'oth-21',
    name: 'Fabric Composition Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fabric-70x50-spec',
  },
  {
    id: 'oth-22',
    name: 'Fabric Composition Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fabric-70x50-company',
  },
  {
    id: 'oth-23',
    name: 'Fabric Composition Label',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-fabric-70x50-rows',
  },
  {
    id: 'oth-24',
    name: 'Barcode Label',
    dimensions: '50 x 20',
    category: 'Other',
    width: 50,
    height: 20,
    previewType: 'other-barcode-library',
  },
  {
    id: 'oth-25',
    name: 'Barcode Label',
    dimensions: '50 x 30',
    category: 'Other',
    width: 50,
    height: 30,
    previewType: 'other-barcode-apparel',
  },
  {
    id: 'oth-26',
    name: 'Barcode Label',
    dimensions: '80 x 50',
    category: 'Other',
    width: 80,
    height: 50,
    previewType: 'other-barcode-elementary',
  },
  {
    id: 'oth-27',
    name: 'After-Sales Service Card',
    dimensions: '60 x 40',
    category: 'Other',
    width: 60,
    height: 40,
    previewType: 'other-service-card-warranty',
  },
  {
    id: 'oth-28',
    name: 'After-Sales Service Card',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-service-water-filter',
  },
  {
    id: 'oth-29',
    name: 'After-Sales Service Card',
    dimensions: '70 x 50',
    category: 'Other',
    width: 70,
    height: 50,
    previewType: 'other-service-equipment',
  },

  // --- CIRCLE ---
  {
    id: 'cir-1',
    name: '401-Circle',
    nameLine2: 'Label-34x34-Ï†30',
    dimensions: '34 x 34',
    category: 'Circle',
    width: 34,
    height: 34,
    previewType: 'circle-30',
  },
  {
    id: 'cir-2',
    name: '402-Circle',
    nameLine2: 'Label-45x45-Ï†40',
    dimensions: '45 x 45',
    category: 'Circle',
    width: 45,
    height: 45,
    previewType: 'circle-40',
  },
  {
    id: 'cir-3',
    name: '403-Circle',
    nameLine2: 'Label-52x52-Ï†50',
    dimensions: '52 x 52',
    category: 'Circle',
    width: 52,
    height: 52,
    previewType: 'circle-50',
  },

  // --- JEWELRY (14 items in exact order as screenshots) ---
  {
    id: 'jwl-1',
    name: 'Dumbell Label-13x85',
    dimensions: '85 x 13',
    category: 'Jewelry',
    width: 85,
    height: 13,
    previewType: 'jew-dumbell-13x85',
  },
  {
    id: 'jwl-2',
    name: 'Dumbell Label-15x85',
    dimensions: '85 x 15',
    category: 'Jewelry',
    width: 85,
    height: 15,
    previewType: 'jew-dumbell-15x85',
  },
  {
    id: 'jwl-3',
    name: 'Hangtag-15.9x41.3',
    dimensions: '41.3 x 15.9',
    category: 'Jewelry',
    width: 41.3,
    height: 15.9,
    previewType: 'jew-hangtag-159x413',
  },
  {
    id: 'jwl-4',
    name: 'Jewelry',
    nameLine2: 'Label-20x20+30',
    dimensions: '50 x 20',
    category: 'Jewelry',
    width: 50,
    height: 20,
    previewType: 'jew-label-20x20-right',
  },
  {
    id: 'jwl-5',
    name: 'Jewelry',
    nameLine2: 'Label-20x20+30-1',
    dimensions: '50 x 20',
    category: 'Jewelry',
    width: 50,
    height: 20,
    previewType: 'jew-label-20x20-left',
  },
  {
    id: 'jwl-6',
    name: 'Jewelry',
    nameLine2: 'Label-50x13+30',
    dimensions: '80 x 13',
    category: 'Jewelry',
    width: 80,
    height: 13,
    previewType: 'jew-label-50x13-horizontal',
  },
  {
    id: 'jwl-7',
    name: 'Jewelry',
    nameLine2: 'Label-50x13+30-Y',
    dimensions: '80 x 13',
    category: 'Jewelry',
    width: 80,
    height: 13,
    previewType: 'jew-label-50x13-yellow',
  },
  {
    id: 'jwl-8',
    name: 'Jewelry',
    nameLine2: 'Sample-25x30+45',
    dimensions: '75 x 25',
    category: 'Jewelry',
    width: 75,
    height: 25,
    previewType: 'jew-sample-25x30-flower',
  },
  {
    id: 'jwl-9',
    name: 'Jewelry',
    nameLine2: 'Sample-30x25+45',
    dimensions: '70 x 30',
    category: 'Jewelry',
    width: 70,
    height: 30,
    previewType: 'jew-sample-30x25-stacked',
  },
  {
    id: 'jwl-10',
    name: 'Jewelry',
    nameLine2: 'Sample-30x25+45',
    dimensions: '70 x 30',
    category: 'Jewelry',
    width: 70,
    height: 30,
    previewType: 'jew-sample-30x25-pattern',
  },
  {
    id: 'jwl-11',
    name: 'Jewelry Sample-50x15',
    dimensions: '50 x 15',
    category: 'Jewelry',
    width: 50,
    height: 15,
    previewType: 'jew-sample-50x15-holes',
  },
  {
    id: 'jwl-12',
    name: 'Jewelry',
    nameLine2: 'Sample-50x19+8',
    dimensions: '50 x 27',
    category: 'Jewelry',
    width: 50,
    height: 27,
    previewType: 'jew-sample-50x19-tabs',
  },
  {
    id: 'jwl-13',
    name: 'Jewelry Sample-53x14',
    dimensions: '53 x 14',
    category: 'Jewelry',
    width: 53,
    height: 14,
    previewType: 'jew-sample-53x14-bar',
  },
  {
    id: 'jwl-14',
    name: 'Rat Tail',
    nameLine2: 'Label-14.3x63.5+38.1',
    dimensions: '101.6 x 14.3',
    category: 'Jewelry',
    width: 101.6,
    height: 14.3,
    previewType: 'jew-rattail-143x635',
  },

  // --- SUPERMARKET (14 items, all prices in Indian Rupees â‚¹) ---
  {
    id: 'smkt-1',
    name: 'Black Label-Yellow-60x40',
    dimensions: '60 x 40',
    category: 'Supermarket',
    width: 60,
    height: 40,
    previewType: 'smkt-black-yellow-60x40',
  },
  {
    id: 'smkt-2',
    name: 'Orange-50x30',
    dimensions: '50 x 30',
    category: 'Supermarket',
    width: 50,
    height: 30,
    previewType: 'smkt-orange-50x30',
  },
  {
    id: 'smkt-3',
    name: 'Yellow-40x30',
    dimensions: '40 x 30',
    category: 'Supermarket',
    width: 40,
    height: 30,
    previewType: 'smkt-yellow-40x30',
  },
  {
    id: 'smkt-4',
    name: 'Shelf Price',
    nameLine2: 'Label-50x30-1',
    dimensions: '50 x 30',
    category: 'Supermarket',
    width: 50,
    height: 30,
    previewType: 'smkt-shelf-50x30-1',
  },
  {
    id: 'smkt-5',
    name: 'Shelf Price',
    nameLine2: 'Label-50x30-2',
    dimensions: '50 x 30',
    category: 'Supermarket',
    width: 50,
    height: 30,
    previewType: 'smkt-shelf-50x30-2',
  },
  {
    id: 'smkt-6',
    name: 'Black Label-two color-50x30',
    dimensions: '50 x 30',
    category: 'Supermarket',
    width: 50,
    height: 30,
    previewType: 'smkt-twocolor-50x30',
  },
  {
    id: 'smkt-7',
    name: 'Black Label-Yellow-40x30',
    dimensions: '40 x 30',
    category: 'Supermarket',
    width: 40,
    height: 30,
    previewType: 'smkt-black-yellow-40x30',
  },
  {
    id: 'smkt-8',
    name: 'Red-40x30',
    dimensions: '40 x 30',
    category: 'Supermarket',
    width: 40,
    height: 30,
    previewType: 'smkt-red-40x30',
  },
  {
    id: 'smkt-9',
    name: 'Black Label-75x38',
    dimensions: '75 x 38',
    category: 'Supermarket',
    width: 75,
    height: 38,
    previewType: 'smkt-black-75x38',
  },
  {
    id: 'smkt-10',
    name: 'Black Label-Green-60x40',
    dimensions: '60 x 40',
    category: 'Supermarket',
    width: 60,
    height: 40,
    previewType: 'smkt-black-green-60x40',
  },
  {
    id: 'smkt-11',
    name: 'SALE Talker-63.5x98.4',
    dimensions: '63.5 x 98.4',
    category: 'Supermarket',
    width: 63.5,
    height: 98.4,
    previewType: 'smkt-sale-talker-635x984',
  },
  {
    id: 'smkt-12',
    name: 'Shelf Price',
    nameLine2: 'Label-84x30-1',
    dimensions: '84 x 30',
    category: 'Supermarket',
    width: 84,
    height: 30,
    previewType: 'smkt-shelf-84x30-cvs',
  },
  {
    id: 'smkt-13',
    name: 'Shelf Price',
    nameLine2: 'Label-84x30-1',
    dimensions: '84 x 30',
    category: 'Supermarket',
    width: 84,
    height: 30,
    previewType: 'smkt-shelf-84x30-bbq',
  },
  {
    id: 'smkt-14',
    name: 'Shelf Price',
    nameLine2: 'Label-84x30-2',
    dimensions: '84 x 30',
    category: 'Supermarket',
    width: 84,
    height: 30,
    previewType: 'smkt-shelf-84x30-2',
  },

  // --- FOOD (4 items in exact order as screenshots) ---
  {
    id: 'food-1',
    name: 'Baked Food Label-30x15',
    dimensions: '30 x 15',
    category: 'Food',
    width: 30,
    height: 15,
    previewType: 'food-baked-30x15',
  },
  {
    id: 'food-2',
    name: 'Food Price Label-49.6x29.6',
    dimensions: '49.6 x 29.6',
    category: 'Food',
    width: 49.6,
    height: 29.6,
    previewType: 'food-price-496x296',
  },
  {
    id: 'food-3',
    name: 'Imported Food',
    nameLine2: 'Label-60x50',
    dimensions: '60 x 50',
    category: 'Food',
    width: 60,
    height: 50,
    previewType: 'food-imported-60x50',
  },
  {
    id: 'food-4',
    name: 'Ingredients Label-50x40',
    dimensions: '50 x 40',
    category: 'Food',
    width: 50,
    height: 40,
    previewType: 'food-ingredients-50x40',
  },

  // --- APPLIANCES ---
  {
    id: 'appl-1',
    name: 'Electrical Appliances-40x20',
    dimensions: '40 x 20',
    category: 'Appliances',
    width: 40,
    height: 20,
    previewType: 'appl-electrical-40x20',
  },

  // --- STORAGE ---
  {
    id: 'str-3',
    name: 'Home Storage-50x20',
    dimensions: '50 x 20',
    category: 'Storage',
    width: 50,
    height: 20,
    previewType: 'storage-home-50x20',
  },
  {
    id: 'str-4',
    name: 'Kitchen Cabinet',
    nameLine2: 'Label-101.6x50.8',
    dimensions: '101.6 x 50.8',
    category: 'Storage',
    width: 101.6,
    height: 50.8,
    previewType: 'storage-kitchen-cabinet-101x51',
  },
  {
    id: 'str-5',
    name: 'Kitchen',
    nameLine2: 'Label-44.45x31.75',
    dimensions: '44.45 x 31.75',
    category: 'Storage',
    width: 44.45,
    height: 31.75,
    previewType: 'storage-kitchen-vanilla-44x32',
  },
  {
    id: 'str-1',
    name: '201-Transparent-30x20',
    dimensions: '30 x 20',
    category: 'Storage',
    width: 30,
    height: 20,
    previewType: 'transparent-30x20',
  },
  {
    id: 'str-2',
    name: '202-Transparent-40x20',
    dimensions: '40 x 20',
    category: 'Storage',
    width: 40,
    height: 20,
    previewType: 'transparent-40x20',
  },

  // --- FILE ---
  {
    id: 'file-1',
    name: 'Address',
    nameLine2: 'Label-66.7x25.4',
    dimensions: '66.7 x 25.4',
    category: 'File',
    width: 66.7,
    height: 25.4,
    previewType: 'file-address-667x254',
  },
  {
    id: 'file-2',
    name: 'File Cabinet',
    nameLine2: 'Label-52x16.9',
    dimensions: '52 x 16.9',
    category: 'File',
    width: 52,
    height: 16.9,
    previewType: 'file-cabinet-52x169',
  },
  {
    id: 'file-3',
    name: 'File Folder Label-192x61',
    dimensions: '192 x 61',
    category: 'File',
    width: 192,
    height: 61,
    previewType: 'file-folder-192x61',
  },
  {
    id: 'file-4',
    name: 'File Label-40x25A',
    dimensions: '40 x 25',
    category: 'File',
    width: 40,
    height: 25,
    previewType: 'file-label-40x25a',
  },
  {
    id: 'file-5',
    name: 'File Label-40x25B',
    dimensions: '40 x 25',
    category: 'File',
    width: 40,
    height: 25,
    previewType: 'file-label-40x25b',
  },
  {
    id: 'file-6',
    name: 'Visitor Badge-96.8x54',
    dimensions: '96.8 x 54',
    category: 'File',
    width: 96.8,
    height: 54,
    previewType: 'file-visitor-968x54',
  },

  // --- ASSET ---
  {
    id: 'asset-1',
    name: 'Asset Tag-50.8x19',
    dimensions: '50.8 x 19',
    category: 'Asset',
    width: 50.8,
    height: 19,
    previewType: 'asset-tag-508x19',
  },
  {
    id: 'asset-2',
    name: 'Asset Tag-69.85x31.75',
    dimensions: '69.85 x 31.75',
    category: 'Asset',
    width: 69.85,
    height: 31.75,
    previewType: 'asset-tag-6985x3175',
  },
  {
    id: 'asset-3',
    name: 'Asset Tag-95.25x50.8-1',
    dimensions: '95.25 x 50.8',
    category: 'Asset',
    width: 95.25,
    height: 50.8,
    previewType: 'asset-tag-9525x508-1',
  },
  {
    id: 'asset-4',
    name: 'Asset Tag-95.25x50.8-2',
    dimensions: '95.25 x 50.8',
    category: 'Asset',
    width: 95.25,
    height: 50.8,
    previewType: 'asset-tag-9525x508-2',
  },

  // --- SCHOOL ---
  {
    id: 'sch-1',
    name: 'Name Sticker A-40x25',
    dimensions: '40 x 25',
    category: 'School',
    width: 40,
    height: 25,
    previewType: 'school-name-sticker-40x25a',
  },
  {
    id: 'sch-2',
    name: 'Name Sticker B-40x25',
    dimensions: '40 x 25',
    category: 'School',
    width: 40,
    height: 25,
    previewType: 'school-name-sticker-40x25b',
  },

  // --- MATERIAL ---
  {
    id: 'mat-1',
    name: 'Material Label-44.5x14',
    dimensions: '44.5 x 14',
    category: 'Material',
    width: 44.5,
    height: 14,
    previewType: 'material-label-445x14',
  },
  {
    id: 'mat-2',
    name: 'Material Label-61x50.8',
    dimensions: '61 x 50.8',
    category: 'Material',
    width: 61,
    height: 50.8,
    previewType: 'material-label-61x508',
  },
  {
    id: 'mat-3',
    name: 'Material Label-70x22.2',
    dimensions: '70 x 22.2',
    category: 'Material',
    width: 70,
    height: 22.2,
    previewType: 'material-label-70x222',
  },
  {
    id: 'mat-4',
    name: 'Material Label-80x40',
    dimensions: '80 x 40',
    category: 'Material',
    width: 80,
    height: 40,
    previewType: 'material-label-80x40',
  },

  // --- RACKING ---
  {
    id: 'rack-1',
    name: 'Rack Label-80x40',
    dimensions: '80 x 40',
    category: 'Racking',
    width: 80,
    height: 40,
    previewType: 'rack-label-80x40',
  },
  {
    id: 'rack-2',
    name: 'Rack Label-100x40',
    dimensions: '100 x 40',
    category: 'Racking',
    width: 100,
    height: 40,
    previewType: 'rack-label-100x40',
  },

  // --- LABORATORY ---
  {
    id: 'lab-1',
    name: 'Laboratory',
    nameLine2: 'Label-50.8x37',
    dimensions: '50.8 x 37',
    category: 'Laboratory',
    width: 50.8,
    height: 37,
    previewType: 'lab-label-508x37',
  },
  {
    id: 'lab-2',
    name: 'Microscope Slide',
    nameLine2: 'Label-22x22',
    dimensions: '22 x 22',
    category: 'Laboratory',
    width: 22,
    height: 22,
    previewType: 'lab-microscope-22x22',
  },
  {
    id: 'lab-3',
    name: 'Pathology Label-50.8x19',
    dimensions: '50.8 x 19',
    category: 'Laboratory',
    width: 50.8,
    height: 19,
    previewType: 'lab-pathology-508x19',
  },
];

/** Same document and pad chrome as the editor editing pad. */
function TemplatePreview({ item }: { item: TemplateItem }) {
  const document = useMemo(
    () =>
      createIndustryTemplateDocument({
        name: item.nameLine2 ? `${item.name} ${item.nameLine2}` : item.name,
        category: item.category,
        widthMm: item.width,
        heightMm: item.height,
        previewType: item.previewType,
      }),
    [item],
  );

  return (
    <LabelPreview document={document} maxHeight={LABEL_PAD_STAGE_MIN_HEIGHT} showStage />
  );
}

function TemplateLocalEmptyIllustration() {
  return (
    <View style={styles.localEmptyIllustration}>
      <View style={styles.localEmptyBoxBack} />
      <View style={styles.localEmptyBoxFront} />
      <View style={styles.localEmptyFlapLeft} />
      <View style={styles.localEmptyFlapRight} />
      <View style={styles.localEmptyPlane}>
        <View style={styles.localEmptyPlaneBody} />
        <View style={styles.localEmptyPlaneWing} />
      </View>
      <View style={styles.localEmptyTrail}>
        <View style={[styles.localEmptyTrailDot, { opacity: 0.35 }]} />
        <View style={[styles.localEmptyTrailDot, { opacity: 0.55 }]} />
        <View style={[styles.localEmptyTrailDot, { opacity: 0.75 }]} />
      </View>
    </View>
  );
}

const INDUSTRY_CATEGORY_COUNT = CATEGORY_GROUPS.reduce(
  (count, group) => count + group.items.length,
  0
);

export default function TemplateScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.six);
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const layoutWidth = Math.min(windowWidth, MaxContentWidth);
  const templateCardMaxWidth = Math.min(520, layoutWidth - 124);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'local' | 'industry' | 'cloud'>('industry');
  const [selectedCategory, setSelectedCategory] = useState('Popular');
  const [localGroup, setLocalGroup] = useState<string>('All');
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [newGroupVisible, setNewGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');

  const documents = useLabelStore((s) => s.documents);
  const groups = useLabelStore((s) => s.groups);
  const addGroup = useLabelStore((s) => s.addGroup);
  const deleteDocument = useLabelStore((s) => s.deleteDocument);
  const cloudProfile = useLabelStore((s) => s.cloudProfile);
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const signIn = useLabelStore((s) => s.signIn);
  const signOut = useLabelStore((s) => s.signOut);
  const deleteCloudTemplate = useLabelStore((s) => s.deleteCloudTemplate);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const ensureLocalDocument = useLabelStore((s) => s.ensureLocalDocument);
  const { t } = useTranslation();

  const localDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) =>
      sortNewestFirst ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt,
    );
    let list = sorted;
    if (localGroup === 'Ungrouped') list = sorted.filter((d) => !d.groupId);
    else if (localGroup !== 'All') list = sorted.filter((d) => d.groupId === localGroup);
    const q = searchQuery.toLowerCase().trim();
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));
    return list;
  }, [documents, localGroup, searchQuery, sortNewestFirst]);

  const visibleCloudTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cloudTemplates;
    return cloudTemplates.filter((t) => t.name.toLowerCase().includes(q));
  }, [cloudTemplates, searchQuery]);

  const handleEditCloudTemplate = (tpl: (typeof cloudTemplates)[number]) => {
    const local = ensureLocalDocument(tpl.id);
    if (!local) return;
    router.push({ pathname: '/edit', params: { labelId: local.id } });
  };

  const handleDeleteCloudTemplate = (tpl: (typeof cloudTemplates)[number]) => {
    Alert.alert('Delete Cloud Template', `Delete "${tpl.name}" from cloud sync?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCloudTemplate(tpl.id) },
    ]);
  };

  const rightScrollRef = useRef<ScrollView>(null);

  const handleCategoryPress = (category: string) => {
    setSelectedCategory(category);
    rightScrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Filter templates by selected category or search query
  const filteredTemplates = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return TEMPLATES.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.dimensions.toLowerCase().includes(q) ||
          (t.nameLine2 && t.nameLine2.toLowerCase().includes(q)) ||
          t.category.toLowerCase().includes(q)
      );
    }
    return TEMPLATES.filter((t) => t.category.toLowerCase() === selectedCategory.toLowerCase());
  }, [searchQuery, selectedCategory]);

  const handleSelectTemplate = (template: TemplateItem) => {
    const name = template.nameLine2 ? `${template.name} ${template.nameLine2}` : template.name;
    const doc = createIndustryTemplateDocument({
      name,
      category: template.category,
      widthMm: template.width,
      heightMm: template.height,
      previewType: template.previewType,
    });
    upsertDocument(doc);
    router.push({
      pathname: '/edit',
      params: { labelId: doc.id },
    });
  };

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (name) addGroup(name);
    setNewGroupName('');
    setNewGroupVisible(false);
  };

  const handleLogin = () => {
    const email = loginEmail.trim();
    if (!email) return;
    signIn(email, loginName.trim() || email.split('@')[0]);
    setLoginVisible(false);
    setLoginEmail('');
    setLoginName('');
  };

  const handleDeleteLocal = (id: string, name: string) => {
    Alert.alert('Delete Label', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDocument(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.layoutShell, { maxWidth: MaxContentWidth, width: layoutWidth }]}>
      {/* Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        {/* Top Search & Actions Row */}
        <View style={styles.topRow}>
          {/* Search Pill */}
          <View style={styles.searchPill}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search Template"
              placeholderTextColor="#8EA9C2"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Right Action Icons: Scanner, Sort */}
          <View style={styles.headerIcons}>
            <Pressable
              hitSlop={8}
              onPress={() => router.push('/scan')}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon name="qrcode.viewfinder" tintColor="#FFFFFF" size={21} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => setSortNewestFirst((v) => !v)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon
                name={sortNewestFirst ? 'arrow.down' : 'arrow.up'}
                tintColor="#FFFFFF"
                size={19}
              />
            </Pressable>
          </View>
        </View>

        {/* Header Tabs: Local (0) | Industry (13) | Cloud */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('local')}
            style={[styles.tabItem, activeTab === 'local' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>
              {t('template.local')} ({documents.length})
            </Text>
            {activeTab === 'local' && <View style={styles.tabIndicator} />}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('industry')}
            style={[styles.tabItem, activeTab === 'industry' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'industry' && styles.tabTextActive]}>
              {t('template.industry')} ({INDUSTRY_CATEGORY_COUNT})
            </Text>
            {activeTab === 'industry' && <View style={styles.tabIndicator} />}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('cloud')}
            style={[styles.tabItem, activeTab === 'cloud' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'cloud' && styles.tabTextActive]}>
              {t('template.cloud')}
            </Text>
            {activeTab === 'cloud' && <View style={styles.tabIndicator} />}
          </Pressable>
        </View>
      </View>

      {activeTab === 'cloud' ? (
        cloudProfile ? (
          <ScrollView
            style={styles.cloudSignedInScroll}
            contentContainerStyle={[styles.cloudSignedInContent, { paddingBottom: tabPad }]}
            showsVerticalScrollIndicator={false}>
            <View style={styles.cloudProfileCard}>
              <View style={styles.cloudAvatar}>
                <Text style={styles.cloudAvatarText}>
                  {cloudProfile.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cloudProfileInfo}>
                <Text style={styles.cloudProfileName}>{cloudProfile.name}</Text>
                <Text style={styles.cloudProfileEmail}>{cloudProfile.email}</Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert('Sign Out', 'Sign out from cloud sync?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
                  ])
                }
                style={({ pressed }) => [styles.cloudSignOutBtn, pressed && styles.cardPressed]}>
                <Text style={styles.cloudSignOutText}>Sign Out</Text>
              </Pressable>
            </View>

            <Text style={styles.cloudSectionTitle}>
              Saved on this device ({cloudTemplates.length})
            </Text>

            {visibleCloudTemplates.length === 0 ? (
              <View style={styles.cloudEmptyCard}>
                <AppIcon name="icloud.and.arrow.up" tintColor="#9EAFC0" size={30} />
                <Text style={styles.cloudEmptyText}>
                  {searchQuery.trim()
                    ? 'No synced templates match your search.'
                    : 'No synced templates yet. Use Upload on the Home screen or in the editor to sync a label.'}
                </Text>
              </View>
            ) : (
              visibleCloudTemplates.map((tpl) => (
                <View key={tpl.id} style={styles.localCard}>
                  <View style={styles.cardHeaderBanner}>
                    <View style={styles.bannerLeft}>
                      <Text numberOfLines={1} style={styles.bannerTitle}>
                        {tpl.name}
                      </Text>
                    </View>
                    <Text style={styles.bannerDimensions}>
                      {tpl.widthMm.toFixed(0)} x {tpl.heightMm.toFixed(0)}
                    </Text>
                  </View>
                  <LabelPreview
                    document={tpl}
                    maxHeight={LABEL_PAD_STAGE_MIN_HEIGHT}
                    showStage
                  />
                  <View style={styles.cardFooter}>
                    <Pressable hitSlop={10} onPress={() => handleEditCloudTemplate(tpl)}>
                      <AppIcon name="square.and.pencil" tintColor={Palette.accent} size={19} />
                    </Pressable>
                    <Pressable hitSlop={10} onPress={() => handleDeleteCloudTemplate(tpl)}>
                      <AppIcon name="trash" tintColor="#DC2626" size={18} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        ) : (
        <View style={styles.cloudContent}>
          <Pressable
            style={({ pressed }) => [styles.cloudLoginBtn, pressed && styles.cardPressed]}
            onPress={() => setLoginVisible(true)}>
            <Text style={styles.cloudLoginText}>Login</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cloudPublicBtn, pressed && styles.cardPressed]}
            onPress={() => {
              setSearchQuery('');
              setActiveTab('industry');
              setSelectedCategory('Popular');
            }}>
            <Text style={styles.cloudPublicText}>Public Access</Text>
          </Pressable>

          <Text style={styles.cloudDescription}>
            We provide the function of sharing label templates online. Through &apos;Online Sharing&apos;,
            you can obtain the label templates shared by others with you in real time, and you can also
            share your own label templates with others. To use this function, please click
            &apos;Login&apos;.
          </Text>
        </View>
        )
      ) : (
      <View style={styles.body}>
        {/* Left Category Sidebar */}
        <View style={styles.sidebar}>
          <ScrollView
            style={styles.sidebarScroll}
            contentContainerStyle={[styles.sidebarContent, { paddingBottom: tabPad }]}
            showsVerticalScrollIndicator={false}>
            {activeTab === 'local' ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.localNewGroupBtn, pressed && styles.cardPressed]}
                  onPress={() => setNewGroupVisible(true)}>
                  <View style={styles.localNewGroupIconWrap}>
                    <AppIcon name="square.stack.3d.up.fill" tintColor="#FFFFFF" size={22} />
                  </View>
                  <Text style={styles.localNewGroupText}>New Group</Text>
                </Pressable>

                <Pressable
                  onPress={() => setLocalGroup('All')}
                  style={[styles.categoryItem, localGroup === 'All' && styles.categoryItemActive]}>
                  <Text
                    style={[
                      styles.categoryItemText,
                      localGroup === 'All' && styles.categoryItemTextActive,
                    ]}>
                    All
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setLocalGroup('Ungrouped')}
                  style={[styles.categoryItem, localGroup === 'Ungrouped' && styles.categoryItemActive]}>
                  <Text
                    style={[
                      styles.categoryItemText,
                      localGroup === 'Ungrouped' && styles.categoryItemTextActive,
                    ]}>
                    Ungrouped
                  </Text>
                </Pressable>

                {groups.map((group) => (
                  <Pressable
                    key={group.id}
                    onPress={() => setLocalGroup(group.id)}
                    style={[styles.categoryItem, localGroup === group.id && styles.categoryItemActive]}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={[
                        styles.categoryItemText,
                        localGroup === group.id && styles.categoryItemTextActive,
                      ]}>
                      {group.name}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : (
            CATEGORY_GROUPS.map((group) => (
              <View key={group.header} style={styles.categoryGroup}>
                {/* Section Header: e.g. "- Popular -" */}
                <View style={styles.groupHeaderWrap}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.groupHeaderText}>
                    - {group.header} -
                  </Text>
                </View>

                {/* Sub-items */}
                {group.items.map((item) => {
                  const isSelected = selectedCategory === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => handleCategoryPress(item)}
                      style={[styles.categoryItem, isSelected && styles.categoryItemActive]}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={[
                          styles.categoryItemText,
                          isSelected && styles.categoryItemTextActive,
                        ]}>
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))
            )}
          </ScrollView>
        </View>

        {/* Right Templates List */}
        <View style={styles.contentArea}>
          {activeTab === 'local' ? (
            localDocuments.length === 0 ? (
              <View style={styles.localEmptyWrap}>
                <TemplateLocalEmptyIllustration />
                <Text style={styles.localEmptyText}>No label template was found</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.templatesScroll}
                contentContainerStyle={[
                  styles.templatesContent,
                  { paddingBottom: tabPad, alignItems: 'center' },
                ]}
                showsVerticalScrollIndicator={false}>
                {localDocuments.map((docItem) => (
                  <Pressable
                    key={docItem.id}
                    onPress={() =>
                      router.push({ pathname: '/edit', params: { labelId: docItem.id } })
                    }
                    style={({ pressed }) => [
                      styles.templateCard,
                      { maxWidth: templateCardMaxWidth, width: '100%' },
                      pressed && styles.cardPressed,
                    ]}>
                    <View style={styles.cardHeaderBanner}>
                      <View style={styles.bannerLeft}>
                        <Text numberOfLines={1} style={styles.bannerTitle}>
                          {docItem.name}
                        </Text>
                      </View>
                      <Text style={styles.bannerDimensions}>
                        {docItem.widthMm.toFixed(0)} x {docItem.heightMm.toFixed(0)}
                      </Text>
                    </View>
                    <LabelPreview
                      document={docItem}
                      maxHeight={LABEL_PAD_STAGE_MIN_HEIGHT}
                      showStage
                    />
                    <View style={styles.cardFooter}>
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          router.push({ pathname: '/print', params: { labelId: docItem.id } })
                        }>
                        <AppIcon name="printer" tintColor="#606F7B" size={18} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleDeleteLocal(docItem.id, docItem.name)}>
                        <AppIcon name="trash" tintColor="#DC2626" size={18} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )
          ) : (
          <ScrollView
            ref={rightScrollRef}
            style={styles.templatesScroll}
            contentContainerStyle={[
              styles.templatesContent,
              {
                paddingBottom: tabPad,
                alignItems: 'center',
              },
            ]}
            showsVerticalScrollIndicator={false}>
            {filteredTemplates.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleSelectTemplate(item)}
                style={({ pressed }) => [
                  styles.templateCard,
                  { maxWidth: templateCardMaxWidth, width: '100%' },
                  pressed && styles.cardPressed,
                ]}>
                {/* Cyan Header Banner */}
                <View style={styles.cardHeaderBanner}>
                  <View style={styles.bannerLeft}>
                    <Text numberOfLines={1} style={styles.bannerTitle}>
                      {item.name}
                    </Text>
                    {item.nameLine2 ? (
                      <Text numberOfLines={1} style={styles.bannerSubtitle}>
                        {item.nameLine2}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.bannerDimensions}>{item.dimensions}</Text>
                </View>

                {/* Visual Label Canvas Preview */}
                <TemplatePreview item={item} />

                {/* Bottom Action Footer: Clock + Share */}
                <View style={styles.cardFooter}>
                  {/* Circular clock history icon */}
                  <View style={styles.footerClock}>
                    <AppIcon name="clock" tintColor="#606F7B" size={17} />
                  </View>

                  {/* Share node icon */}
                  <ShareNodeIcon color={Palette.accent} size={20} />
                </View>
              </Pressable>
            ))}

            {filteredTemplates.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No templates found</Text>
              </View>
            )}
          </ScrollView>
          )}
        </View>
      </View>
      )}
      </View>

      <Modal
        visible={newGroupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewGroupVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>New Group</Text>
            <TextInput
              style={styles.modalInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group name"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setNewGroupVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSaveBtn]} onPress={handleCreateGroup}>
                <Text style={styles.modalSaveText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={loginVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLoginVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Cloud Login</Text>
            <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 12 }}>
              Saved on this phone only — there is no remote cloud account yet.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={loginName}
              onChangeText={setLoginName}
              placeholder="Display name (optional)"
              placeholderTextColor="#94A3B8"
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setLoginVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSaveBtn]} onPress={handleLogin}>
                <Text style={styles.modalSaveText}>Login</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EFF2F7',
    alignItems: 'center',
  },
  layoutShell: {
    flex: 1,
    width: '100%',
  },
  header: {
    backgroundColor: '#214668',
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  searchPill: {
    flex: 1,
    height: 36,
    backgroundColor: '#3C6182',
    borderRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '500',
    textAlign: 'center',
    padding: 0,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    minWidth: 38,
    minHeight: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 6,
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    position: 'relative',
  },
  tabItemActive: {},
  tabText: {
    color: '#9EAFC0',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  // Sidebar
  sidebar: {
    width: 104,
    backgroundColor: '#F5F7FA',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E2E6EC',
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarContent: {
    paddingVertical: 6,
  },
  categoryGroup: {
    marginBottom: 4,
  },
  groupHeaderWrap: {
    height: 38,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#214668',
    textAlign: 'center',
    includeFontPadding: false,
  },
  categoryItem: {
    height: 38,
    width: '100%',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryItemActive: {
    backgroundColor: '#FFFFFF',
  },
  categoryItemText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#556473',
    textAlign: 'center',
    includeFontPadding: false,
  },
  categoryItemTextActive: {
    color: '#17A6B8',
    fontWeight: '600',
  },
  // Right Content Area
  contentArea: {
    flex: 1,
    backgroundColor: '#EFF2F7',
  },
  templatesScroll: {
    flex: 1,
  },
  templatesContent: {
    padding: 10,
    gap: 14,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHeaderBanner: {
    backgroundColor: '#20A4B8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bannerLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  bannerSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  bannerDimensions: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
  },
  // Preview Canvas
  previewBox: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tallPreviewBox: {
    paddingVertical: 14,
  },
  rectOutline: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  dualStackedContainer: {
    width: '100%',
  },
  dualColsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dualColBox: {
    flex: 1,
  },
  macaroonFill: {
    width: '100%',
    height: 125,
    backgroundColor: '#E4D8F3',
    borderRadius: 8,
  },
  cartoonBox: {
    backgroundColor: '#FAD5DF',
    borderRadius: 8,
    margin: 4,
    height: 125,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  bunnyTopLeft: {
    position: 'absolute',
    top: '10%',
    left: '4%',
  },
  bunnyCenter: {
    position: 'absolute',
    bottom: '6%',
    left: '38%',
  },
  bunnyTopRight: {
    position: 'absolute',
    top: '8%',
    right: '6%',
  },
  bowCenter: {
    position: 'absolute',
    top: '20%',
    left: '54%',
  },
  bowRight: {
    position: 'absolute',
    bottom: '22%',
    right: '3%',
  },
  starOne: {
    position: 'absolute',
    bottom: '18%',
    left: '20%',
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.9,
  },
  starTwo: {
    position: 'absolute',
    top: '30%',
    right: '34%',
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
  },
  confettiWrap: {
    position: 'absolute',
    bottom: 0,
    right: '32%',
    flexDirection: 'row',
    gap: 4,
  },
  confettiTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  watercolorBox: {
    width: '100%',
    height: 125,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFF0F5',
  },
  watercolorPink: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F7CCD9',
    opacity: 0.8,
  },
  watercolorYellow: {
    position: 'absolute',
    bottom: -10,
    left: '20%',
    width: 140,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FDE49E',
    opacity: 0.65,
  },
  watercolorPurple: {
    position: 'absolute',
    top: -10,
    right: '15%',
    width: 120,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5D0F5',
    opacity: 0.7,
  },
  watercolorPeach: {
    position: 'absolute',
    top: 20,
    left: 10,
    width: 110,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FCE0C8',
    opacity: 0.6,
  },
  pillBorderContainer: {
    width: '100%',
    height: 85,
    borderRadius: 18,
    borderWidth: 2.2,
    borderColor: '#4A2E1C',
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  pillGreenBlock: {
    width: '32%',
    height: '100%',
    backgroundColor: '#9BD6A7',
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
    borderRightWidth: 1.5,
    borderRightColor: '#4A2E1C',
  },
  pillWhiteBlock: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  transparentInnerBox: {
    width: '100%',
    height: 120,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 4,
  },
  circleBoxContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  circleOutline: {
    borderWidth: 1.2,
    borderColor: '#3D4A56',
    backgroundColor: 'transparent',
  },
  jewelryContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
  },
  jewDumbellRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  jewDumbellCapsule: {
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  jewDumbellBridge: {
    width: 14,
    height: 10,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  jewTinyBarcodeNum: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    marginTop: 2,
  },
  jewProductLine: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 10,
  },
  jewHangtagWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
  },
  jewHangtagNotch: {
    width: 10,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRightWidth: 0,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  jewHangtagBody: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  jewHangtagTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'lowercase',
  },
  jewHangtagSerration: {
    width: 8,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
  },
  jewFlagRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  jewStackedLeft: {
    width: 88,
  },
  jewStackedRight: {
    width: 88,
    marginLeft: 'auto',
  },
  jewStackBox: {
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jewStackDash: {
    height: 1,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    marginVertical: 1,
  },
  jewStackDashVertical: {
    width: 1,
    height: '100%',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  jewTailRight: {
    flex: 1,
    height: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#FFFFFF',
    marginTop: 28,
  },
  jewTailLeft: {
    flex: 1,
    height: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRightWidth: 0,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    backgroundColor: '#FFFFFF',
    marginTop: 28,
  },
  jewHorizontalPair: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: 130,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  jewYellowBox: {
    height: 52,
    borderColor: '#262626',
  },
  jewYellowDash: {
    width: 1,
    backgroundColor: '#262626',
  },
  jewPatternBox: {
    position: 'relative',
    overflow: 'hidden',
  },
  jewSampleTailWrap: {
    flex: 1,
    position: 'relative',
    height: 36,
    justifyContent: 'flex-end',
  },
  jewSampleTailFlap: {
    position: 'absolute',
    top: 0,
    left: 8,
    width: 36,
    height: 10,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  jewHolesRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
  },
  jewHoleBox: {
    flex: 1,
    height: 58,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  jewPunchHole: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  jewTabsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  jewTabUnit: {
    flex: 1,
    alignItems: 'center',
  },
  jewTabFlap: {
    width: 22,
    height: 14,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderBottomWidth: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jewPunchHoleSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  jewTabBody: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  jewBarDumbellRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  jewBarCapsule: {
    width: 110,
    height: 48,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  jewBarConnector: {
    width: 28,
    height: 8,
    borderTopWidth: 1.2,
    borderBottomWidth: 1.2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  jewRatTailRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  jewRatTailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  jewRatTailBarcodeCol: {
    alignItems: 'center',
    marginRight: 8,
  },
  jewRatTailBarcodeNum: {
    fontSize: 6.5,
    fontWeight: '500',
    color: '#111827',
    marginTop: 1,
  },
  jewRatTailTextCol: {
    justifyContent: 'center',
  },
  jewRatTailLine: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 10,
  },
  jewRatTailStrip: {
    flex: 1,
    height: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderLeftWidth: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#FFFFFF',
  },

  // --- SUPERMARKET STYLES ---
  smktLabelCard: {
    width: '100%',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    padding: 8,
    overflow: 'hidden',
  },
  smktRowSplit: {
    flexDirection: 'row',
    gap: 8,
  },
  smktLeftCol: {
    flex: 1,
  },
  smktTitleBold: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 14,
    marginBottom: 4,
  },
  smktMetaText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 11,
  },
  smktBarcodeNum: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginTop: 2,
  },
  smktClearanceBox: {
    width: 72,
    backgroundColor: '#F7E329',
    borderRadius: 4,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smktClearanceTitle: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  smktPriceHuge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 24,
  },
  smktWasText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2,
  },
  smktStrike: {
    textDecorationLine: 'line-through',
  },
  smktOrangeBand: {
    backgroundColor: '#F97316',
    marginTop: 6,
    marginHorizontal: -8,
    marginBottom: -8,
    padding: 8,
  },
  smktOrangeProduct: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  smktOrangePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  smktOrangeUnitLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: '#111827',
  },
  smktOrangeUnitPrice: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
  },
  smktOrangeMainPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  smktYellowBandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F4F16A',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  smktWhoopsText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  smktWasInline: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
  },
  smktNowPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  smktMeatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  smktMeatTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 11,
  },
  smktMeatUnit: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
  },
  smktMeatMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  smktYellowPricePill: {
    backgroundColor: '#F7E329',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  smktYellowPriceText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  smktMeatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  smktTinyMeta: {
    fontSize: 7,
    fontWeight: '600',
    color: '#374151',
  },
  smktYellowTopBar: {
    height: 8,
    backgroundColor: '#F7E329',
    marginHorizontal: -8,
    marginTop: -8,
    marginBottom: 6,
  },
  smktRetailPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  smktRetailLabel: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 9,
  },
  smktSupPriceWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  smktSupPriceMain: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 30,
  },
  smktSupPriceCents: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginTop: 2,
  },
  smktDescLine: {
    fontSize: 7.5,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 1,
  },
  smktDescSub: {
    fontSize: 7,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  smktTwoColorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  smktMangoTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  smktTwoColorBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F7E329',
    marginHorizontal: -8,
    marginBottom: -8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  smktSaleLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  smktSalePrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  smktFullYellowCard: {
    backgroundColor: '#F7E329',
    padding: 0,
  },
  smktMilkSegment: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D4C820',
  },
  smktMilkSegmentBottom: {
    borderBottomWidth: 0,
  },
  smktMilkBrand: {
    fontSize: 10,
    fontWeight: '900',
    color: '#111827',
  },
  smktMilkDesc: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#111827',
    marginVertical: 2,
  },
  smktMilkPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  smktMilkPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  smktRedOuter: {
    width: '100%',
    backgroundColor: '#DC2626',
    borderRadius: 8,
    padding: 8,
  },
  smktReducedTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  smktRedInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  smktRedPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 4,
  },
  smktNowRed: {
    textAlign: 'right',
  },
  smktNowRedLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
  },
  smktNowRedPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  smktBbqGrid: {
    flexDirection: 'row',
  },
  smktBbqLeft: {
    flex: 1,
  },
  smktBlueProductBlock: {
    backgroundColor: '#3D91C0',
    padding: 6,
    marginBottom: 2,
  },
  smktBbqTitle: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 10,
  },
  smktBbqTitleSmall: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 9,
  },
  smktBbqSub: {
    fontSize: 6.5,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2,
    backgroundColor: '#5BA3CC',
    paddingVertical: 1,
  },
  smktBbqBarcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  smktUnitOz: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 9,
  },
  smktBbqPriceCol: {
    width: 52,
    backgroundColor: '#E0DC45',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  smktRupeeSmall: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
  },
  smktBbqBigPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 18,
  },
  smktGreenHeader: {
    backgroundColor: '#8CC63F',
    marginHorizontal: -8,
    marginTop: -8,
    padding: 8,
    alignItems: 'center',
  },
  smktGreenTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  smktWipesBody: {
    flexDirection: 'row',
    marginTop: 6,
  },
  smktWipesLeft: {
    flex: 1,
  },
  smktBullet: {
    fontSize: 7,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 10,
  },
  smktWipesPriceCol: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smktWipesPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  smktTalkerCard: {
    width: '100%',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  smktTalkerWhite: {
    backgroundColor: '#FFFFFF',
    padding: 8,
  },
  smktTalkerProduct: {
    fontSize: 10,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
  },
  smktTalkerWhiteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  smktTalkerPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  smktTalkerYellow: {
    backgroundColor: '#F7E329',
    padding: 8,
    borderTopWidth: 2,
    borderTopColor: '#DC2626',
  },
  smktTalkerPromo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  smktTalkerSave: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginVertical: 4,
  },
  smktTalkerSplit: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 4,
  },
  smktTalkerSplitCol: {
    flex: 1,
  },
  smktTalkerSplitDivider: {
    width: 1,
    backgroundColor: '#111827',
    marginHorizontal: 4,
  },
  smktTalkerRed: {
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    alignItems: 'center',
  },
  smktTalkerSale: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F7E329',
    textTransform: 'lowercase',
  },
  smktWideShelfRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smktWideLeft: {
    flex: 1,
  },
  smktWideProduct: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  smktWideRight: {
    width: 90,
    alignItems: 'center',
  },
  smktYouPayBar: {
    backgroundColor: '#46ACC2',
    width: '100%',
    paddingVertical: 2,
    alignItems: 'center',
    marginTop: 2,
  },
  smktYouPayText: {
    fontSize: 7,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  smktWidePrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginTop: 2,
  },
  smktWideBbqRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  smktWideBbqLeft: {
    flex: 1,
  },
  smktUnitOzWide: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
    alignSelf: 'center',
    marginHorizontal: 4,
  },
  smktBbqPriceColWide: {
    width: 48,
    backgroundColor: '#E0DC45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smktEverydayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smktEverydayLeft: {
    flex: 1,
  },
  smktEverydayTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 13,
  },
  smktEverydayRight: {
    width: 80,
  },
  smktYouPayBox: {
    backgroundColor: '#46ACC2',
    padding: 6,
    alignItems: 'center',
    borderRadius: 2,
  },
  smktYouPaySmall: {
    fontSize: 7,
    fontWeight: '500',
    color: '#111827',
  },
  smktEverydayPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  smktEverydayDesc: {
    fontSize: 6.5,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
    textAlign: 'center',
  },

  // --- FOOD STYLES ---
  foodBakedBox: {
    width: '100%',
    height: 72,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  foodBakedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  foodPriceOuter: {
    width: '100%',
    paddingVertical: 4,
  },
  foodPriceInner: {
    width: '100%',
    height: 110,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 8,
  },
  foodPriceBarcodeCol: {
    flex: 0.62,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 6,
  },
  foodBarcodeNum: {
    fontSize: 7.5,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
    textAlign: 'center',
  },
  foodPriceTextCol: {
    flex: 0.38,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foodRotatedWrap: {
    transform: [{ rotate: '-90deg' }],
    width: 110,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  foodRotatedLine: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 12,
  },
  foodRotatedPrice: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
  },
  foodImportedCard: {
    width: '100%',
    minHeight: 140,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  foodImportedTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  foodImportedLine: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 14,
    marginBottom: 2,
  },
  foodIngredientsCard: {
    width: '100%',
    minHeight: 130,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodIngredientsHeading: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
  },
  foodIngredientsItem: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 16,
    textAlign: 'center',
  },

  // --- APPLIANCES STYLES ---
  applElectricalCard: {
    width: '100%',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applCompanyName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },
  applPhoneLine: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 2,
  },
  applBarcodeNum: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // --- STORAGE LABEL STYLES ---
  storageHomeBox: {
    width: '100%',
    height: 72,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  storageHomeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  storageCabinetBox: {
    width: '100%',
    minHeight: 100,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  storageCabinetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginVertical: 4,
  },
  storageOrnamentRow: {
    width: '75%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  storageOrnamentLine: {
    flex: 1,
    height: 1.2,
    backgroundColor: '#111827',
  },
  storageOrnamentHeart: {
    fontSize: 10,
    color: '#111827',
    marginHorizontal: 8,
  },
  storageVanillaFrame: {
    width: '100%',
    borderWidth: 1.2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    padding: 8,
  },
  storageVanillaInner: {
    width: '100%',
    minHeight: 90,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  storageVanillaLine: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 22,
  },

  // --- FILE LABEL STYLES ---
  filePreviewBox: {
    backgroundColor: '#F0F2F6',
    minHeight: 96,
  },
  fileOctPreviewBox: {
    minHeight: 148,
    paddingVertical: 16,
  },
  fileAddressBadge: {
    width: '88%',
    maxWidth: 320,
    backgroundColor: '#39D353',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCautionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
  },
  fileCautionDash: {
    width: 5,
    height: 2,
    backgroundColor: '#111827',
    transform: [{ skewX: '-18deg' }],
  },
  fileAddressText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: 0.2,
    marginVertical: 4,
    textAlign: 'center',
  },
  fileCabinetLabel: {
    width: '90%',
    maxWidth: 340,
    height: 54,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCabinetText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  fileFolderLabel: {
    width: '92%',
    maxWidth: 360,
    height: 78,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileFolderText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
  fileOctWrap: {
    width: '86%',
    maxWidth: 300,
    aspectRatio: 40 / 25,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileOctColorBlock: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fileOctInnerCard: {
    width: '100%',
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileOctCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    backgroundColor: '#F0F2F6',
    transform: [{ rotate: '45deg' }],
  },
  fileOctCornerTL: {
    top: -6,
    left: -6,
  },
  fileOctCornerTR: {
    top: -6,
    right: -6,
  },
  fileOctCornerBL: {
    bottom: -6,
    left: -6,
  },
  fileOctCornerBR: {
    bottom: -6,
    right: -6,
  },
  fileOctLinePrimary: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  fileOctLineSecondary: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  fileDashedDivider: {
    width: '72%',
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    marginVertical: 3,
  },
  fileVisitorBadge: {
    width: '78%',
    maxWidth: 280,
    aspectRatio: 96.8 / 54,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileVisitorHeading: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  fileVisitorName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginTop: 5,
  },
  fileVisitorCompany: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginTop: 2,
  },
  fileVisitorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 6,
  },
  fileVisitorMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: '#111827',
  },

  // --- ASSET TAG STYLES ---
  assetTagCard: {
    width: '92%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  assetTagPropertyLine: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 13,
  },
  assetTagHeading: {
    fontSize: 9,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginTop: 6,
  },
  assetTagNumber: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginTop: 2,
  },
  assetTagWideCard: {
    width: '92%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  assetWaveLogoWrap: {
    width: 42,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetWaveLogoShape: {
    width: 30,
    height: 40,
    borderWidth: 5,
    borderColor: '#111827',
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-12deg' }],
  },
  assetTagWideContent: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  assetCompanyName: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
  },
  assetCompanyLine: {
    fontSize: 8.5,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
    marginTop: 2,
  },
  assetBarcodeNum: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
    marginTop: 3,
  },
  assetHarkCard: {
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  assetHarkBanner: {
    width: '100%',
    backgroundColor: '#247331',
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  assetHarkBannerText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 13,
  },
  assetHarkBarcodeNum: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    marginTop: 6,
    textAlign: 'center',
  },
  assetHarkFormCard: {
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#247331',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  assetHarkFormTitle: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 12,
  },
  assetHarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  assetHarkLabel: {
    width: 62,
    fontSize: 7.5,
    fontWeight: '500',
    color: '#111827',
  },
  assetHarkValueBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  assetHarkValue: {
    fontSize: 7,
    fontWeight: '600',
    color: '#111827',
  },
  assetHarkSummary: {
    fontSize: 6,
    fontWeight: '600',
    color: '#111827',
    marginTop: 6,
    textAlign: 'center',
  },

  // --- SCHOOL STYLES ---
  schoolNamePrimary: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  schoolClassLine: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  schoolNameSecondary: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },

  // --- MATERIAL STYLES ---
  materialSmallCard: {
    width: '92%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  materialNutText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  materialBarcodeNum: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    marginTop: 5,
    textAlign: 'center',
  },
  materialLockNutCard: {
    width: '90%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  materialLockNutHeader: {
    backgroundColor: '#214668',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialLockNutTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  materialLockNutBody: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  materialLockNutCol: {
    flex: 1,
    minWidth: 0,
  },
  materialLockNutLine: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 12,
    marginBottom: 2,
  },
  materialScrewTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  materialSpecCard: {
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  materialSpecTitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
  },
  materialSpecRow: {
    marginBottom: 6,
  },
  materialSpecText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  materialSpecUnderline: {
    height: 1.2,
    backgroundColor: '#111827',
    width: '100%',
  },

  // --- RACKING STYLES ---
  rackLabelCard: {
    width: '92%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  rackLabelContent: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  rackLabelTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  rackLabelCode: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  rackLabelWideCard: {
    width: '92%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  rackLabelWideContent: {
    flex: 1,
    minWidth: 0,
  },
  rackLabelIsleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    marginTop: 8,
  },
  rackArrowDownWrap: {
    width: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackArrowDownStem: {
    width: 3,
    height: 34,
    borderWidth: 2,
    borderColor: '#111827',
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  rackArrowDownHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#111827',
    marginTop: -2,
  },
  rackArrowRightWrap: {
    width: 44,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackArrowRightStem: {
    width: 28,
    height: 3,
    borderWidth: 2,
    borderColor: '#111827',
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  rackArrowRightHead: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#111827',
    marginLeft: -2,
  },

  // --- LABORATORY STYLES ---
  labCameoCard: {
    width: '88%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  labCameoTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  labCameoLine: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 14,
  },
  labMicroscopeCard: {
    width: '88%',
    maxWidth: 280,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  labMicroscopeCode: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: 1.2,
    marginTop: 4,
    marginBottom: 6,
  },
  labMicroscopeMeta: {
    fontSize: 8.5,
    fontWeight: '500',
    color: '#111827',
    alignSelf: 'flex-start',
    lineHeight: 12,
    width: '100%',
  },
  labPathologyCard: {
    width: '92%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  labPathologyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 5,
    gap: 6,
  },
  labPathologySplitRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  labPathologySplitItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  labPathologyLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#111827',
  },
  labPathologyField: {
    flex: 1,
    minWidth: 0,
  },
  labPathologyPlaceholder: {
    fontSize: 8,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 1,
  },
  labPathologyUnderline: {
    height: 1.2,
    backgroundColor: '#111827',
    width: '100%',
  },

  // --- CABLE SPECIFIC STYLES ---
  cableYellowContainer: {
    width: '100%',
    height: 125,
    backgroundColor: '#F7E329',
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#262626',
  },
  cableYellowCol: {
    flex: 1,
    height: '100%',
    borderColor: '#262626',
  },
  cableThinP0Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },
  cableThinP0Head: {
    width: 120,
    height: 26,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cableThinP0DashedLine: {
    width: 1,
    height: '100%',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  cableThinP0Tail: {
    flex: 1,
    height: 12,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  cable301Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  cable301Head: {
    width: 105,
    height: 70,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cable301TopHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cable301DashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  cable301BottomHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cable301Tail: {
    flex: 1,
    height: 16,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#FFFFFF',
    marginTop: 10,
  },
  cable428Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 10,
  },
  cable428Head: {
    width: 140,
    height: 86,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cable428Top: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cable428TopTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
  },
  cable428TopSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000000',
  },
  cable428Bottom: {
    flex: 1.1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cable428BottomText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 11.5,
  },
  cable428Tail: {
    flex: 1,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  cableDashedLine: {
    height: 1,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderStyle: 'dashed',
  },
  cableTallDualContainer: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  cableTallSingleTag: {
    flex: 1,
    alignItems: 'flex-start',
  },
  cableTallTagHead: {
    width: '100%',
    height: 145,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cableTallVerticalDash: {
    width: 1,
    height: '100%',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderStyle: 'dashed',
  },
  cableTallTagTail: {
    width: 36,
    height: 110,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  cableD38Container: {
    width: '100%',
    gap: 6,
    paddingVertical: 4,
  },
  cableD38TopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cableD38BottomRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  cableD38TagHead: {
    width: 105,
    height: 58,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cableD38TopTail: {
    flex: 1,
    height: 14,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#FFFFFF',
    marginTop: 6,
  },
  cableD38BottomTail: {
    flex: 1,
    height: 14,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    borderRightWidth: 0,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  cableD38TextHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 1,
  },
  cableD38SmallText: {
    fontSize: 7.5,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 9.5,
  },
  cableGp60Container: {
    width: '100%',
    height: 165,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingVertical: 8,
  },
  cableGp60Col: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cableGp60Hole: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
    marginBottom: 4,
  },
  cableGp60Code: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#000000',
  },
  cableGp60Title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
    marginTop: 2,
    marginBottom: 4,
  },
  cableGp60Details: {
    alignItems: 'center',
  },
  cableGp60Sub: {
    fontSize: 7.5,
    fontWeight: '500',
    color: '#1E293B',
    lineHeight: 9.5,
  },
  cableGp60Emp: {
    fontSize: 9,
    fontWeight: '500',
    color: '#000000',
    marginTop: 6,
  },
  cableGp60Divider: {
    width: 1,
    height: '100%',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderStyle: 'dashed',
  },
  cableHb38Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cableHb38Tail: {
    width: 95,
    height: 18,
    backgroundColor: '#DE2626',
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    marginBottom: 6,
  },
  cableHb38Head: {
    width: 100,
    height: 66,
    backgroundColor: '#DE2626',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
  },
  cableHb38Half: {
    flex: 1,
  },
  cableHb38WhiteDash: {
    height: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderStyle: 'dashed',
  },
  cableLf45Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 10,
  },
  cableLf45Head: {
    width: 100,
    gap: 2,
  },
  cableLf45Box: {
    width: 100,
    height: 32,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  cableLf45Tail: {
    flex: 1,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  cableLf64Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  cableLf64Head: {
    width: 130,
    height: 70,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cableLf64Half: {
    flex: 1,
  },
  cableLf64Tail: {
    flex: 1,
    height: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#FFFFFF',
    marginTop: 10,
  },
  cableTStyleContainer: {
    width: '100%',
    alignItems: 'center',
  },
  cableTStyleTopBox: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 2,
  },
  cableTStyleMiddleBox: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  cableTStyleTail: {
    width: 34,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  cablePStyleBarcodeContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
  },
  cablePStyleBarcodeHead: {
    width: 95,
    height: 86,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cablePStyleBarcodeTop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
  },
  cableBarcodeNumber: {
    fontSize: 7.5,
    fontWeight: '500',
    color: '#000000',
    marginTop: 1,
  },
  cablePStyleBarcodeBottom: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  cableUsbText: {
    fontSize: 6.5,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 7.5,
  },
  cableLogoText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#000000',
  },
  cableTrashWrap: {
    alignItems: 'center',
  },
  cableTrashUnderline: {
    width: 10,
    height: 1.5,
    backgroundColor: '#111827',
    marginTop: 1,
  },
  cablePStyleBarcodeTail: {
    flex: 1,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  cablePanel23Container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  cablePanel23Head: {
    width: 120,
    height: 86,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cablePanel23Top: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cablePanel23Text: {
    fontSize: 10,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 13,
  },
  cablePanel23Bottom: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cablePanel23Tail: {
    flex: 1,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderLeftWidth: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#FFFFFF',
    marginTop: 10,
  },
  cableTStyleBarcodeContainer: {
    width: '100%',
    alignItems: 'center',
  },
  cableTStyleTextHead: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cableTStyleBigText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 14,
  },
  cableTStyleDashedDivider: {
    width: '90%',
    height: 1,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderStyle: 'dashed',
    marginVertical: 2,
  },
  cableTStyleBarcodeMiddle: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cableTStyleBarcodeNumber: {
    fontSize: 9,
    fontWeight: '500',
    color: '#000000',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  cableTStyleBarcodeTail: {
    width: 32,
    height: 75,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#FFFFFF',
  },

  // --- OTHER SPECIFIC STYLES ---
  other5RowsContainer: {
    width: '100%',
    height: 120,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  other5RowsItem: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  otherRowDashed: {
    width: '100%',
    height: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  other15x25Box: {
    width: 140,
    height: 250,
    borderWidth: 2,
    borderColor: '#0F172A',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  cornerAccent: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: '#94A3B8',
  },
  other50x14Container: {
    width: '100%',
  },
  otherFormCard: {
    width: '100%',
    padding: 6,
  },
  otherTallCard: {
    width: '100%',
    minHeight: 250,
    padding: 6,
  },
  otherInnerRoundedCard: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#FFFFFF',
  },
  otherFormRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  otherFormLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#000000',
  },
  otherFormSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  otherSolidDivider: {
    height: 1.5,
    backgroundColor: '#1E293B',
    marginVertical: 6,
  },
  otherUnderlineField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  otherFieldZh: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
  },
  otherFieldEn: {
    fontSize: 9,
    fontWeight: '600',
    color: '#334155',
  },
  otherFullUnderline: {
    flex: 1,
    height: 1.2,
    backgroundColor: '#1E293B',
    marginLeft: 6,
    marginBottom: 2,
  },
  otherFieldRowUnderline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  otherFieldHeading: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#000000',
  },
  otherFlexUnderline: {
    flex: 1,
    height: 1.2,
    backgroundColor: '#1E293B',
    marginLeft: 4,
    marginBottom: 2,
  },
  otherSplitUnderlinesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  otherHalfUnderlineWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  otherSubLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#475569',
  },
  otherLargeUnit: {
    fontSize: 18,
    fontWeight: '500',
    color: '#000000',
  },
  otherGridCard: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  otherGridRowThree: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  otherGridCellText: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
  },
  otherGridVerticalLine: {
    width: 1.2,
    height: '100%',
    backgroundColor: '#1E293B',
  },
  otherGridHorizontalLine: {
    height: 1.2,
    backgroundColor: '#1E293B',
  },
  otherGridRowSingle: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  otherLargeFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  otherLargeFieldText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000000',
  },
  otherCenterTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 6,
  },
  otherCenterSubDate: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 2,
  },
  otherQrBottomWrap: {
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
  },
  otherQrRuleTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000000',
    marginTop: 6,
  },
  otherQrRuleText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 11,
  },
  otherBorderBadge: {
    borderWidth: 1.2,
    borderColor: '#1E293B',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  otherTinyText: {
    fontSize: 8,
    fontWeight: '500',
    color: '#000000',
  },
  otherDisclaimerText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
    marginTop: 8,
  },
  otherTableCard: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  otherTableRow: {
    flexDirection: 'row',
    height: 28,
  },
  otherTableHeadingCol: {
    width: 65,
    fontSize: 10.5,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
    borderRightWidth: 1.2,
    borderRightColor: '#1E293B',
    lineHeight: 28,
  },
  otherTableValueCol: {
    flex: 1,
  },
  otherDisclaimerSmall: {
    fontSize: 8,
    fontWeight: '600',
    color: '#334155',
    marginTop: 6,
    lineHeight: 10,
  },
  otherTableFullCell: {
    padding: 4,
  },
  otherTableSplitRow: {
    flexDirection: 'row',
  },
  otherTableHalfCell: {
    flex: 1,
    padding: 4,
  },
  otherBarcodeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000000',
    letterSpacing: 1,
  },
  otherPriceText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000000',
    marginTop: 2,
  },

  // Card Footer
  cardFooter: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 18,
  },
  footerClock: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#8A97A4',
    fontSize: 14,
  },
  cloudContent: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  cloudLoginBtn: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cloudLoginText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cloudPublicBtn: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cloudPublicText: {
    color: Palette.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  cloudDescription: {
    width: '100%',
    maxWidth: 340,
    fontSize: 14,
    lineHeight: 22,
    color: '#8A97A4',
    textAlign: 'left',
  },
  localNewGroupBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },
  localNewGroupIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  localNewGroupText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556473',
    textAlign: 'center',
  },
  localEmptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 24,
  },
  localEmptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  localEmptyIllustration: {
    width: 160,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localEmptyBoxBack: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#B8DDF5',
    borderRadius: 4,
  },
  localEmptyBoxFront: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#9ECAE8',
    borderTopWidth: 2,
    borderTopColor: '#7FB8DC',
    borderRadius: 4,
  },
  localEmptyFlapLeft: {
    position: 'absolute',
    bottom: 68,
    left: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '-24deg' }],
    borderTopLeftRadius: 3,
  },
  localEmptyFlapRight: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '24deg' }],
    borderTopRightRadius: 3,
  },
  localEmptyPlane: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 34,
    height: 34,
    transform: [{ rotate: '-18deg' }],
  },
  localEmptyPlaneBody: {
    position: 'absolute',
    top: 14,
    left: 0,
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  localEmptyPlaneWing: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#8EC5E8',
  },
  localEmptyTrail: {
    position: 'absolute',
    top: 24,
    right: 52,
    flexDirection: 'row',
    gap: 5,
    transform: [{ rotate: '-18deg' }],
  },
  localEmptyTrailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  localPreviewWrap: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F7F9FC',
  },
  localCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    ...cardShadow,
  },
  cloudSignedInScroll: {
    flex: 1,
  },
  cloudSignedInContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cloudProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    ...cardShadow,
  },
  cloudAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
  },
  cloudProfileInfo: {
    flex: 1,
  },
  cloudProfileName: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  cloudProfileEmail: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  cloudSignOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  cloudSignOutText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  cloudSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8A97A4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  cloudEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...cardShadow,
  },
  cloudEmptyText: {
    color: '#94A3B8',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSaveBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
