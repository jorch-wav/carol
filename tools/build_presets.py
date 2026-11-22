#!/usr/bin/env python3
"""Assemble web/presets/<id>.json (one file per bird) from the fit, info, sources and plate.
Run after tools/fit_all.sh. Usage: build_presets.py [ids...]"""
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import style as carol_style  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
# Collections, in menu order. A bird's collection is where its recordings and plate come from.
# Collections = zoogeographic realms (where each species is native), as field guides and the IOC list
# group birds; inside each, birds are ordered by the IOC taxonomic sequence (order, then family).
COLLECTIONS = {
    'Australasia': ['magpie', 'kookaburra', 'wattlebird', 'rosella', 'lyrebird', 'butcherbird', 'whipbird', 'bellminer',
                    'cockatoo', 'lorikeet', 'curlew', 'boobook',
                    'helmeted', 'fairywren', 'shrikethrush', 'whistler', 'raven', 'wagtail', 'frogmouth', 'galah', 'gangang', 'blackcockatoo', 'tui'],
    'Palearctic': ['robin', 'pigeon'],
    'Nearctic': ['cardinal'],
    'Neotropics': ['quetzal'],
}
COLLECTION_INFO = {
    'Australasia': {'region': 'Australia, New Guinea, New Zealand', 'about': 'Birds of Australia and its neighbours, from the garden to the bush. Plates by John Gould, The Birds of Australia.'},
    'Palearctic': {'region': 'Europe, North Africa, North Asia', 'about': 'Native to Europe, North Africa and northern Asia (the rock dove now lives wild in cities worldwide). Plates by John Gould, The Birds of Great Britain.'},
    'Nearctic': {'region': 'North America', 'about': 'Native to North America. Plate by John James Audubon, The Birds of America.'},
    'Neotropics': {'region': 'Central and South America', 'about': 'Native to Central and South America. Plate by John Gould, A Monograph of the Trogonidae.'},
}
# IOC sequence (approximate, for the orders and families Carol has; unknown ones sort last, by name)
ORDER_SEQ = ['Struthioniformes', 'Casuariiformes', 'Galliformes', 'Anseriformes', 'Caprimulgiformes', 'Podargiformes', 'Apodiformes',
             'Cuculiformes', 'Columbiformes', 'Gruiformes', 'Charadriiformes', 'Accipitriformes', 'Strigiformes', 'Trogoniformes',
             'Bucerotiformes', 'Coraciiformes', 'Piciformes', 'Falconiformes', 'Psittaciformes', 'Passeriformes']
FAMILY_SEQ = ['Podargidae', 'Columbidae', 'Burhinidae', 'Strigidae', 'Trogonidae', 'Alcedinidae', 'Cacatuidae', 'Psittaculidae',
              'Menuridae', 'Maluridae', 'Meliphagidae', 'Psophodidae', 'Pachycephalidae', 'Colluricinclidae', 'Artamidae',
              'Rhipiduridae', 'Corvidae', 'Muscicapidae', 'Cardinalidae']
FAMILY_NAMES = {'Podargidae': 'Frogmouths', 'Columbidae': 'Pigeons and doves', 'Burhinidae': 'Stone-curlews', 'Strigidae': 'Owls',
                'Trogonidae': 'Trogons and quetzals', 'Alcedinidae': 'Kingfishers', 'Cacatuidae': 'Cockatoos', 'Psittaculidae': 'Old World parrots',
                'Menuridae': 'Lyrebirds', 'Maluridae': 'Fairywrens', 'Meliphagidae': 'Honeyeaters', 'Psophodidae': 'Whipbirds',
                'Pachycephalidae': 'Whistlers and shrike-thrushes', 'Colluricinclidae': 'Shrike-thrushes', 'Artamidae': 'Butcherbirds, magpies and woodswallows',
                'Rhipiduridae': 'Fantails', 'Corvidae': 'Crows and ravens', 'Muscicapidae': 'Old World flycatchers and chats', 'Cardinalidae': 'Cardinals'}


def tax_key(t):
    o, f = t.get('order', ''), t.get('family', '')
    return (ORDER_SEQ.index(o) if o in ORDER_SEQ else 99, FAMILY_SEQ.index(f) if f in FAMILY_SEQ else 99, f, t.get('genus', ''), t.get('species', ''))


BIRDS = [b for bs in COLLECTIONS.values() for b in bs]
COLL_OF = {b: c for c, bs in COLLECTIONS.items() for b in bs}

# Call names by recording, from the recordists' labels (xeno-canto).
CALL_TYPES = {
    'magpie': {'Carol': ['1069711', '217874', '729284'], 'Warble': ['383930', '1041375', '1163888', '1169115'], 'Call': ['826873', '1170181']},
    'kookaburra': {'Laugh': ['371518', '620165', '1169858', '817868', '1188306', '464406', '611558', '1104895'], 'Call': ['716894', '937218']},
    'wattlebird': {'Call': ['1062583', '1163878', '935428', '1135593', '612413', '577691', '1072282'], 'Song': ['935870', '935871', '672982']},
    'rosella': {'Piping': ['1050086', '1069586', '1072331', '1072332'], 'Call': ['1173944', '1166584', '354603', '839934', '935328', '935511']},
    'lyrebird': {'Mimic song': ['1019456', '342585', '195488', '492308', '134449', '832555', '1172718', '1163848'], 'Territorial song': ['1040676'], 'Alarm': ['738172', '195481']},
    'butcherbird': {'Song': ['659987', '593567', '602050', '588690', '745123'], 'Duet': ['580386', '134229'], 'Piping': ['480923'], 'Call': ['1170098', '517761']},
    'whipbird': {'Whip-crack': ['543002', '326392'], 'Duet': ['979796', '201977', '775346', '140207', '647331'], 'Grunt': ['345114'], 'Call': ['441817', '140208']},
    'bellminer': {'Tink': ['1069583', '1169747', '1169748', '1169749', '370405', '401153', '344274', '140198', '134453', '854434']},
    'cockatoo': {'Screech': ['354599', '1071627', '586987', '517536', '195632', '1173884'], 'Flight call': ['1088472', '566248'], 'Alarm': ['1177819'], 'Begging': ['321213']},
    'lorikeet': {'Screech': ['INAT1752421', 'INAT1677411', 'INAT1979743', 'INAT1969471', 'INAT556449'], 'Call': ['INAT155067'], 'Chatter': ['INAT73279', 'INAT2170180', 'INAT638092', 'INAT171953']},
    'curlew': {'Wail': ['597375', '589419', '1074100', '539222', '539213', '857992', '755680', '1038616', '641037'], 'Alarm': ['539184']},
    'boobook': {'Boo-book': ['351978', '1173887', '414340', '1188100', '1133190', '1094530'], 'Bray': ['863940', '863942'], 'Begging': ['513811', '777794']},
    'raven': {'Call': ['935829', '996951', '1062642', '211338', '937188', '935842'], 'Flight call': ['539397'], 'Subsong': ['505696'], 'Begging': ['1069409', '330280']},
    'wagtail': {'Song': ['953372', '935809', '767239', '1069909', '1069588', '155135', '606516'], 'Rattle': ['1170174', '1170177', '1069587', '517759']},
    'frogmouth': {'Oom': ['953020', '953019', '586832', '375096', '1173996', '561573', '643067', '697079'], 'Huff': ['396564'], 'Alarm': ['692557'], 'Begging': ['842281']},
    'galah': {'Contact call': ['935423', '953252', '1166610', '506844'], 'Screech': ['1138701'], 'Flight call': ['330259', '495757', '935909'], 'Alarm': ['506845'], 'Begging': ['935797']},
    'gangang': {'Creak': ['1169134', '1169163', '1169159', '1169118', '1169744', '1072734', '1172996', '330260', '187882'], 'Alarm': ['622269']},
    'blackcockatoo': {'Wail': ['1166249', '1166250', '1166621', '935512', '935853', '871224'], 'Flight screech': ['1072333', '1103268'], 'Shriek': ['826853'], 'Begging': ['345044']},
    'tui': {'Song': ['958028', '1169417', '1177577', '214591', '321682'], 'Bell': ['562526', '842647', '845168', '853667'], 'Chatter': ['1166774', '853670']},
    'helmeted': {'Call': ['INAT1799241', 'INAT1802747', 'INAT1806730', 'INAT874404'], 'Whistle': ['INAT1799242', 'INAT610827', 'INAT822785', 'XC382239'], 'Chatter': ['INAT1806719'], 'Song': ['XC399104']},
    'fairywren': {'Reel song': ['935812', '935405', '935399', '1173642', '1173655', '1173656', '1069584'], 'Family calls': ['1169745', '1069722'], 'Alarm': ['370623']},
    'shrikethrush': {'Song': ['1062933', '1169110', '1173699', '935836', '953166', '858841'], 'Call': ['1173877', '1173902', '1173904'], 'Contact call': ['841626']},
    'whistler': {'Song': ['1166258', '1166261', '1072326', '1072036', '268284'], 'Calls and song': ['1172737', '755564', '496498'], 'Call': ['495653', '572086']},
    'cardinal': {'Song': ['1093538', '1010609', '1012494', '962371', '738212', '721721'], 'Chip': ['1070756', '682547', '1010649'], 'Alarm': ['1012917']},
    'robin': {'Song': ['1080724', '1089386', '1104628', '1141104'], 'Autumn song': ['943953', '1181903'], 'Tic': ['1192854', '998115'], 'Tsee': ['1191139', '661755'], 'Call': ['1190377']},
    'quetzal': {'Song': ['1188164', '1188163', '774050', '137766', '872148'], 'Call': ['326653', '133593', '498299', '171051'], 'Alarm': ['332262']},
    'pigeon': {'Coo': ['342145', '116226', '48676', '270097', '269762', '462611', '178529'], 'Nest call': ['169211', '316785'], 'Alarm': ['121677']},
}

# Look for the shared 2D/3D model, colours sampled by eye from the Gould plates.
LOOKS = {
    'magpie': {'body': [4.4, 2.5, 2.3], 'head': 1.55, 'neck': 1.0, 'tail': 2.9,
               'beak': {'len': 2.2, 'depth': 0.6, 'curve': 0.08, 'hook': 0.05},
               'colors': {'body': '#1c1b1a', 'belly': '#141312', 'head': '#161514', 'wing': '#e9e6df', 'tail': '#1c1b1a', 'beak': '#cfc8b8', 'beak2': '#b9b2a2', 'eye': '#7a2a18', 'legs': '#2a2a2a'},
               'accents': [{'body': True, 'at': [2.9, 2.6, 0], 'r': [1.0, 0.9, 1.2], 'rot': -0.6, 'color': '#efece6', 'layer': 0}]},
    'kookaburra': {'body': [4.0, 2.6, 2.4], 'head': 1.95, 'neck': 0.7, 'tail': 2.7,
                   'beak': {'len': 2.6, 'depth': 0.85, 'curve': 0.05, 'hook': 0.1},
                   'colors': {'body': '#d9d0bd', 'belly': '#ece6d6', 'head': '#e2dac8', 'wing': '#6e5034', 'tail': '#9a5a32', 'beak': '#2b2b2b', 'beak2': '#cbbf9f', 'eye': '#2a1d14', 'legs': '#8d8a7c'},
                   'accents': [{'at': [0.1, 0.25, 0.6], 'r': [1.2, 0.28, 1.4], 'rot': -0.1, 'color': '#4b3624'}]},
    'wattlebird': {'body': [4.3, 2.2, 2.0], 'head': 1.3, 'neck': 1.1, 'tail': 3.4,
                   'beak': {'len': 2.0, 'depth': 0.38, 'curve': 0.32, 'hook': 0},
                   'colors': {'body': '#7a6a57', 'belly': '#b8a689', 'head': '#6a5c4b', 'wing': '#5a4c3d', 'tail': '#5f5142', 'beak': '#1a1a1a', 'beak2': '#1a1a1a', 'eye': '#a12a1c', 'legs': '#7c6f66'},
                   'accents': [{'at': [0.5, -1.25, 0.65], 'r': [0.28, 0.45, 0.25], 'rot': 0, 'color': '#c8402c'},
                               {'body': True, 'at': [1.2, -1.6, 0], 'r': [1.4, 0.6, 1.7], 'rot': -0.2, 'color': '#d8b44a', 'layer': 0}]},
    'rosella': {'body': [3.9, 2.4, 2.2], 'head': 1.5, 'neck': 0.8, 'tail': 3.6,
                'beak': {'len': 1.1, 'depth': 0.8, 'curve': 0.55, 'hook': 0.35},
                'colors': {'body': '#c3182b', 'belly': '#cf2234', 'head': '#c8172a', 'wing': '#2d5fb3', 'tail': '#2b5bb0', 'beak': '#ece4d2', 'beak2': '#ddd3bd', 'eye': '#1b1b1b', 'legs': '#7c7a76'},
                'accents': [{'at': [0.55, -0.45, 0.85], 'r': [0.75, 0.55, 0.3], 'rot': -0.3, 'color': '#4f8fd8'}]},
    # lyrate outer tail feathers drawn as two long curved plumes over a long brown tail
    'lyrebird': {'body': [4.4, 2.6, 2.4], 'head': 1.45, 'neck': 1.1, 'tail': 4.6,
                 'beak': {'len': 1.4, 'depth': 0.5, 'curve': 0.12, 'hook': 0.04},
                 'colors': {'body': '#5b4a3c', 'belly': '#8a7f74', 'head': '#5b4a3c', 'wing': '#7a4630', 'tail': '#8e8a84', 'beak': '#1e1b19', 'beak2': '#1e1b19', 'eye': '#2b1e16', 'legs': '#2a2826'},
                 'streamers': {'len': 8.5, 'w': 0.42, 'color': '#6b4a2f'},
                 'accents': [{'at': [0.55, -0.85, 0.6], 'r': [0.75, 0.6, 0.35], 'rot': 0.2, 'color': '#9c4a2a'},
                             {'at': [0.42, 0.25, 0.6], 'r': [0.36, 0.3, 0.2], 'rot': 0, 'color': '#707880'}]},
    'butcherbird': {'body': [4.0, 2.4, 2.2], 'head': 1.6, 'neck': 0.8, 'tail': 3.0,
                    'beak': {'len': 2.0, 'depth': 0.7, 'curve': 0.05, 'hook': 0.22},
                    'colors': {'body': '#141414', 'belly': '#f5f5f2', 'head': '#111111', 'wing': '#1c1c1c', 'tail': '#151515', 'beak': '#9aa7b3', 'beak2': '#8b98a4', 'eye': '#3b2418', 'legs': '#3c3c3c'},
                    'accents': [{'body': True, 'at': [2.6, 1.55, 0], 'r': [0.75, 1.0, 1.9], 'rot': -0.6, 'color': '#f5f5f2', 'layer': 0},
                                {'body': True, 'at': [-0.6, 0.15, 2.1], 'r': [1.4, 0.3, 0.15], 'rot': -0.3, 'color': '#f5f5f2', 'layer': 0}]},
    'whipbird': {'body': [3.9, 2.3, 2.1], 'head': 1.45, 'neck': 0.8, 'tail': 4.2,
                 'beak': {'len': 1.3, 'depth': 0.5, 'curve': 0.1, 'hook': 0.05},
                 'colors': {'body': '#4f5a2a', 'belly': '#9a9c86', 'head': '#151515', 'wing': '#4a5426', 'tail': '#3e4523', 'beak': '#1a1a1a', 'beak2': '#1a1a1a', 'eye': '#6b2e1e', 'legs': '#2a2a26'},
                 'crest': {'len': 1.3, 'back': 0.6, 'w': 0.8, 'color': '#151515'},
                 'accents': [{'at': [0.25, -0.45, 0.7], 'r': [0.55, 0.62, 0.3], 'rot': 0.1, 'color': '#f2f2ee'},
                             {'body': True, 'at': [2.3, 0.9, 0], 'r': [1.4, 1.2, 1.9], 'rot': -0.4, 'color': '#151515', 'layer': 0}]},
    'bellminer': {'body': [3.7, 2.3, 2.1], 'head': 1.45, 'neck': 0.8, 'tail': 2.7,
                  'beak': {'len': 1.3, 'depth': 0.45, 'curve': 0.15, 'hook': 0},
                  'colors': {'body': '#7a8b2e', 'belly': '#a3a845', 'head': '#7a8b2e', 'wing': '#5d6b22', 'tail': '#5d6b22', 'beak': '#f2c914', 'beak2': '#e5bb10', 'eye': '#4a2c1a', 'legs': '#f08a24'},
                  'accents': [{'at': [0.15, 0.2, 0.62], 'r': [0.42, 0.28, 0.22], 'rot': 0, 'color': '#e2582b'},
                              {'at': [0.85, 0.1, 0.55], 'r': [0.22, 0.2, 0.18], 'rot': 0, 'color': '#e3c93a'}]},
    'cockatoo': {'body': [4.3, 2.8, 2.6], 'head': 1.75, 'neck': 0.7, 'tail': 3.0,
                 'beak': {'len': 1.3, 'depth': 1.05, 'curve': 0.6, 'hook': 0.42},
                 'colors': {'body': '#f4f2ea', 'belly': '#f1eee2', 'head': '#f4f2ea', 'wing': '#f0ede3', 'tail': '#f2e3a0', 'beak': '#2a2a2c', 'beak2': '#2a2a2c', 'eye': '#1c1414', 'legs': '#6f6f6f'},
                 'crest': {'len': 2.2, 'back': 0.9, 'w': 1.0, 'color': '#f5d320'},
                 'accents': [{'at': [0.42, 0.25, 0.62], 'r': [0.38, 0.34, 0.2], 'rot': 0, 'color': '#f1f1ee'},
                             {'at': [0.1, -0.35, 0.75], 'r': [0.45, 0.4, 0.22], 'rot': 0, 'color': '#f4e6a6'}]},
    'lorikeet': {'body': [3.8, 2.3, 2.1], 'head': 1.4, 'neck': 0.7, 'tail': 3.8,
                 'beak': {'len': 0.95, 'depth': 0.7, 'curve': 0.6, 'hook': 0.3},
                 'colors': {'body': '#34a02c', 'belly': '#2c3c9a', 'head': '#2c3e9e', 'wing': '#34a02c', 'tail': '#3a9a30', 'beak': '#e8401c', 'beak2': '#d93a18', 'eye': '#e3401e', 'legs': '#6e6f6e'},
                 'accents': [{'body': True, 'at': [2.35, 0.35, 0], 'r': [1.45, 1.35, 1.95], 'rot': -0.3, 'color': '#f2701c', 'layer': 0},
                             {'body': True, 'at': [2.9, 1.5, 0], 'r': [0.55, 0.45, 1.6], 'rot': -0.5, 'color': '#a8d13a', 'layer': 0}]},
    'curlew': {'body': [4.0, 2.3, 2.1], 'head': 1.5, 'neck': 1.5, 'tail': 2.4,
               'beak': {'len': 1.5, 'depth': 0.45, 'curve': 0.05, 'hook': 0},
               'colors': {'body': '#8c8274', 'belly': '#ede4d2', 'head': '#8c8274', 'wing': '#7d7366', 'tail': '#8c8274', 'beak': '#2a2724', 'beak2': '#2a2724', 'eye': '#f2c21a', 'legs': '#a7a67a'},
               'accents': [{'at': [0.35, 0.62, 0.62], 'r': [0.75, 0.13, 0.15], 'rot': -0.15, 'color': '#f2ede2'},
                           {'at': [0.25, 0.2, 0.62], 'r': [0.7, 0.13, 0.15], 'rot': -0.1, 'color': '#3a2e24'},
                           {'body': True, 'at': [0.4, 0.9, 2.0], 'r': [1.3, 0.28, 0.15], 'rot': -0.25, 'color': '#d8d0bf', 'layer': 0}]},
    'boobook': {'body': [3.7, 2.8, 2.6], 'head': 1.95, 'neck': 0.4, 'tail': 2.2,
                'beak': {'len': 0.6, 'depth': 0.55, 'curve': 0.75, 'hook': 0.3},
                'colors': {'body': '#5a3a25', 'belly': '#c08a5a', 'head': '#6a4630', 'wing': '#5a3a25', 'tail': '#4e3424', 'beak': '#2b2b2e', 'beak2': '#2b2b2e', 'eye': '#b9b65a', 'legs': '#b79a82'},
                'accents': [{'at': [0.7, 0.05, 0.75], 'r': [0.85, 0.85, 0.3], 'rot': 0, 'color': '#3e2a1e'},
                            {'at': [0.95, 0.35, 0.6], 'r': [0.55, 0.22, 0.2], 'rot': 0.2, 'color': '#eeeae2'},
                            {'body': True, 'at': [-0.6, 0.3, 2.05], 'r': [0.15, 0.15, 0.12], 'rot': 0, 'color': '#f1e9da', 'layer': 0},
                            {'body': True, 'at': [-1.4, 0.0, 2.05], 'r': [0.15, 0.15, 0.12], 'rot': 0, 'color': '#f1e9da', 'layer': 0}]},
    'raven': {'body': [4.6, 2.6, 2.4], 'head': 1.55, 'neck': 0.9, 'tail': 3.4,
              'beak': {'len': 1.9, 'depth': 0.75, 'curve': 0.12, 'hook': 0.08},
              'colors': {'body': '#121214', 'belly': '#151517', 'head': '#141416', 'wing': '#2b3350', 'tail': '#121214', 'beak': '#0c0c0c', 'beak2': '#0c0c0c', 'eye': '#f2f2ee', 'legs': '#121214'},
              'accents': [{'at': [0.42, 0.25, 0.66], 'r': [0.1, 0.1, 0.08], 'rot': 0, 'color': '#0a0a0a'}]},
    'wagtail': {'body': [3.4, 2.2, 2.0], 'head': 1.35, 'neck': 0.7, 'tail': 3.9,
                'beak': {'len': 0.8, 'depth': 0.3, 'curve': 0.08, 'hook': 0.06},
                'colors': {'body': '#0f0f11', 'belly': '#f6f5f0', 'head': '#0f0f11', 'wing': '#1b1b1e', 'tail': '#111113', 'beak': '#111111', 'beak2': '#111111', 'eye': '#2b1a10', 'legs': '#1a1a1a'},
                'accents': [{'at': [0.25, 0.55, 0.62], 'r': [0.55, 0.1, 0.14], 'rot': -0.2, 'color': '#ffffff'}]},
    'frogmouth': {'body': [4.0, 2.9, 2.7], 'head': 2.1, 'neck': 0.3, 'tail': 3.0,
                  'beak': {'len': 1.0, 'depth': 1.3, 'curve': 0.35, 'hook': 0.2},
                  'colors': {'body': '#9a958d', 'belly': '#c9c3b8', 'head': '#8f8a83', 'wing': '#8a8076', 'tail': '#8d877e', 'beak': '#4a4a40', 'beak2': '#4a4a40', 'eye': '#e8b82a', 'legs': '#a8957e'},
                  'accents': [{'body': True, 'at': [-0.7, 0.4, 2.1], 'r': [1.4, 0.12, 0.12], 'rot': -0.2, 'color': '#e8e2d8', 'layer': 0},
                              {'at': [0.6, 0.9, 0.3], 'r': [0.5, 0.25, 0.4], 'rot': 0.3, 'color': '#3d3631'}]},
    'galah': {'body': [3.9, 2.5, 2.3], 'head': 1.6, 'neck': 0.7, 'tail': 3.0,
              'beak': {'len': 0.95, 'depth': 0.8, 'curve': 0.6, 'hook': 0.3},
              'colors': {'body': '#a9a9ad', 'belly': '#e8607d', 'head': '#e8607d', 'wing': '#a9a9ad', 'tail': '#6e6e72', 'beak': '#e8e0d0', 'beak2': '#ddd5c4', 'eye': '#2a1a14', 'legs': '#8a8a8c'},
              'crest': {'len': 0.6, 'back': 0.9, 'w': 1.0, 'color': '#f7d3dc'},
              'accents': [{'at': [-0.15, 0.95, 0], 'r': [1.1, 0.45, 0.9], 'rot': 0, 'color': '#f7d3dc'},
                          {'at': [0.42, 0.25, 0.62], 'r': [0.3, 0.3, 0.2], 'rot': 0, 'color': '#e05a6a'}]},
    'gangang': {'body': [3.8, 2.6, 2.4], 'head': 1.6, 'neck': 0.6, 'tail': 2.5,
                'beak': {'len': 0.95, 'depth': 0.85, 'curve': 0.6, 'hook': 0.32},
                'colors': {'body': '#5f6266', 'belly': '#6c6f72', 'head': '#d0242a', 'wing': '#55585c', 'tail': '#3e4044', 'beak': '#c9c2b5', 'beak2': '#bdb6a9', 'eye': '#3a2a24', 'legs': '#6f6f72'},
                'crest': {'len': 1.2, 'back': -0.2, 'w': 0.9, 'color': '#d0242a'},
                'accents': [{'body': True, 'at': [0.3, -0.3, 2.0], 'r': [1.6, 0.9, 0.2], 'rot': -0.2, 'color': '#9a9ea2', 'layer': 0}]},
    'blackcockatoo': {'body': [4.6, 2.7, 2.5], 'head': 1.7, 'neck': 0.7, 'tail': 5.0,
                      'beak': {'len': 1.1, 'depth': 1.0, 'curve': 0.6, 'hook': 0.38},
                      'colors': {'body': '#2a2422', 'belly': '#2a2422', 'head': '#2a2624', 'wing': '#241f1d', 'tail': '#1e1a19', 'beak': '#2a2a2a', 'beak2': '#2a2a2a', 'eye': '#2a1c18', 'legs': '#6e6a68'},
                      'crest': {'len': 0.7, 'back': 0.9, 'w': 1.0, 'color': '#2a2624'},
                      'accents': [{'at': [0.1, -0.2, 0.75], 'r': [0.55, 0.45, 0.25], 'rot': 0, 'color': '#f2cc32'},
                                  {'at': [0.42, 0.25, 0.62], 'r': [0.3, 0.3, 0.2], 'rot': 0, 'color': '#e08890'},
                                  {'body': True, 'at': [-5.2, -2.4, 0.5], 'r': [1.4, 0.3, 0.5], 'rot': 0.5, 'color': '#f0d040', 'layer': 0}]},
    'tui': {'body': [4.2, 2.5, 2.3], 'head': 1.45, 'neck': 0.9, 'tail': 2.9,
            'beak': {'len': 1.8, 'depth': 0.4, 'curve': 0.25, 'hook': 0},
            'colors': {'body': '#1d2a27', 'belly': '#2b2620', 'head': '#13231f', 'wing': '#173530', 'tail': '#183229', 'beak': '#141414', 'beak2': '#141414', 'eye': '#2a1a12', 'legs': '#2a2420'},
            'accents': [{'at': [0.3, -1.42, 0.22], 'r': [0.43, 0.43, 0.36], 'rot': 0, 'color': '#f4f2ec'},
                        {'body': True, 'at': [2.75, 1.75, 0], 'r': [1.05, 0.85, 1.25], 'rot': -0.5, 'color': '#7d847f', 'layer': 0},
                        {'body': True, 'at': [-0.4, 1.2, 0], 'r': [1.9, 0.9, 2.15], 'rot': 0.1, 'color': '#3a2c20', 'layer': 0}]},
    'helmeted': {'body': [3.7, 2.3, 2.1], 'head': 1.45, 'neck': 0.8, 'tail': 3.0,
                 'beak': {'len': 1.4, 'depth': 0.4, 'curve': 0.18, 'hook': 0},
                 'colors': {'body': '#5a5530', 'belly': '#c8b83a', 'head': '#b8902a', 'wing': '#4a4528', 'tail': '#3e3a24', 'beak': '#1a1a1a', 'beak2': '#1a1a1a', 'eye': '#5a3a22', 'legs': '#6b5e50'},
                 'crest': {'len': 0.6, 'back': -0.3, 'w': 0.9, 'color': '#e0a81c'},
                 'accents': [{'at': [0.55, 0.05, 0.6], 'r': [0.7, 0.32, 0.25], 'rot': 0, 'color': '#141414'},
                             {'at': [-0.35, -0.15, 0.7], 'r': [0.45, 0.2, 0.2], 'rot': -0.4, 'color': '#f5d21a'},
                             {'at': [0.6, -0.75, 0.5], 'r': [0.55, 0.4, 0.35], 'rot': 0, 'color': '#f0cc28'}]},
    'fairywren': {'body': [3.0, 2.2, 2.0], 'head': 1.45, 'neck': 0.5, 'tail': 3.3,
                  'beak': {'len': 0.7, 'depth': 0.3, 'curve': 0.05, 'hook': 0},
                  'colors': {'body': '#3aa8e0', 'belly': '#d8d6cf', 'head': '#5cc8f2', 'wing': '#8a6e52', 'tail': '#2f4f8a', 'beak': '#111111', 'beak2': '#111111', 'eye': '#2a1c14', 'legs': '#7a6450'},
                  'accents': [{'at': [0.3, 0.1, 0.62], 'r': [0.85, 0.22, 0.2], 'rot': 0, 'color': '#10141f'},
                              {'at': [0.6, -0.8, 0.45], 'r': [0.6, 0.5, 0.4], 'rot': 0, 'color': '#10141f'},
                              {'at': [-0.25, 0.35, 0.72], 'r': [0.35, 0.3, 0.18], 'rot': 0, 'color': '#5cc8f2'}]},
    'shrikethrush': {'body': [3.9, 2.4, 2.2], 'head': 1.55, 'neck': 0.8, 'tail': 3.1,
                     'beak': {'len': 1.0, 'depth': 0.5, 'curve': 0.1, 'hook': 0.1},
                     'colors': {'body': '#7e7666', 'belly': '#d8d8d2', 'head': '#8a8c8e', 'wing': '#6e675c', 'tail': '#6c6c6c', 'beak': '#1c1c1c', 'beak2': '#1c1c1c', 'eye': '#3a2a20', 'legs': '#4a4a4a'},
                     'accents': [{'at': [0.72, 0.15, 0.55], 'r': [0.3, 0.2, 0.18], 'rot': 0, 'color': '#e0dfd8'}]},
    'whistler': {'body': [3.5, 2.4, 2.2], 'head': 1.6, 'neck': 0.6, 'tail': 2.8,
                 'beak': {'len': 0.85, 'depth': 0.42, 'curve': 0.08, 'hook': 0.05},
                 'colors': {'body': '#6e7a28', 'belly': '#f2c418', 'head': '#121212', 'wing': '#4a4a3a', 'tail': '#3a3a3a', 'beak': '#121212', 'beak2': '#121212', 'eye': '#7a2e1e', 'legs': '#3a3330'},
                 'accents': [{'at': [0.6, -0.75, 0.45], 'r': [0.55, 0.45, 0.4], 'rot': 0, 'color': '#f4f2ea'},
                             {'body': True, 'at': [2.6, 1.5, 0], 'r': [0.6, 0.55, 1.8], 'rot': -0.5, 'color': '#f2c418', 'layer': 0}]},
    'cardinal': {'body': [3.9, 2.5, 2.3], 'head': 1.55, 'neck': 0.75, 'tail': 3.4,
                 'beak': {'len': 1.15, 'depth': 0.95, 'curve': 0.2, 'hook': 0},
                 'colors': {'body': '#c41e2a', 'belly': '#d2423a', 'head': '#cf1f2c', 'wing': '#9e2a2b', 'tail': '#8c2526', 'beak': '#e8603c', 'beak2': '#de5534', 'eye': '#2a1a12', 'legs': '#a07468'},
                 'crest': {'len': 1.5, 'back': 0.75, 'w': 0.85, 'color': '#d42530'},
                 'accents': [{'at': [1.15, -0.2, 0.45], 'r': [0.5, 0.48, 0.42], 'rot': 0.3, 'color': '#141414'}]},
    'robin': {'body': [3.8, 2.7, 2.5], 'head': 1.6, 'neck': 0.55, 'tail': 2.6,
              'beak': {'len': 0.95, 'depth': 0.36, 'curve': 0.06, 'hook': 0},
              'colors': {'body': '#7a6a4f', 'belly': '#ede8df', 'head': '#7a6a4f', 'wing': '#6e5d44', 'tail': '#6b5a42', 'beak': '#2a2622', 'beak2': '#2a2622', 'eye': '#111111', 'legs': '#8c6e54'},
              'accents': [{'body': True, 'at': [2.05, 0.95, 0], 'r': [1.65, 1.7, 1.95], 'rot': -0.2, 'color': '#9ea3a6', 'layer': 0},
                          {'body': True, 'at': [2.35, 0.85, 0], 'r': [1.65, 1.7, 1.95], 'rot': -0.2, 'color': '#dd6a2e', 'layer': 0},
                          {'at': [0.75, -0.6, 0.5], 'r': [0.75, 0.6, 0.45], 'rot': 0.2, 'color': '#dd6a2e'}]},
    # breeding male; streamers ~1.6-2x body length (upper tail coverts)
    'quetzal': {'body': [4.0, 2.6, 2.4], 'head': 1.55, 'neck': 0.7, 'tail': 2.6,
                'beak': {'len': 0.9, 'depth': 0.6, 'curve': 0.25, 'hook': 0.08},
                'colors': {'body': '#1f8a3b', 'belly': '#c8102e', 'head': '#24913f', 'wing': '#1c7a4a', 'tail': '#f2f2f2', 'beak': '#e8c230', 'beak2': '#d9b229', 'eye': '#2b1a10', 'legs': '#6b6250'},
                'crest': {'len': 1.1, 'back': 0.15, 'w': 1.0, 'color': '#2fa34a'},
                'streamers': {'len': 9.0, 'w': 0.3, 'color': '#2e9a44'},
                'accents': [{'body': True, 'at': [-1.2, 0.5, 0], 'r': [2.4, 0.9, 1.25], 'rot': -0.35, 'color': '#151515', 'layer': 0}]},
    'pigeon': {'body': [4.2, 2.7, 2.5], 'head': 1.3, 'neck': 1.1, 'tail': 2.9,
               'beak': {'len': 0.85, 'depth': 0.38, 'curve': 0.12, 'hook': 0.04},
               'colors': {'body': '#a9b0bb', 'belly': '#9aa3af', 'head': '#6f7a8a', 'wing': '#b3bac4', 'tail': '#7e8794', 'beak': '#2f2f33', 'beak2': '#2f2f33', 'eye': '#e0601c', 'legs': '#d9576b'},
               'accents': [{'at': [-0.15, -1.2, 0.75], 'r': [0.95, 0.75, 0.3], 'rot': 0.3, 'color': '#2e8b6a'},
                           {'at': [-0.35, -1.65, 0.7], 'r': [0.9, 0.55, 0.3], 'rot': 0.3, 'color': '#7b3f8c'},
                           {'at': [1.12, -0.02, 0.12], 'r': [0.24, 0.13, 0.2], 'rot': 0, 'color': '#e8e4dc'},
                           {'body': True, 'at': [-1.4, 0.2, 2.05], 'r': [0.9, 0.16, 0.12], 'rot': -0.5, 'color': '#1e1e20', 'layer': 0},
                           {'body': True, 'at': [-0.6, -0.3, 2.05], 'r': [0.9, 0.16, 0.12], 'rot': -0.5, 'color': '#1e1e20', 'layer': 0}]},
}

# Taxonomy: IOC World Bird List (worldbirdnames.org) is Carol's reference list, so birds
# from anywhere slot into one scheme. Authority = who named it, and when; parentheses mean
# the species has since moved genus. original = the name it was first described under.
TAXONOMY = {
    'magpie': {'order': 'Passeriformes', 'family': 'Artamidae', 'genus': 'Gymnorhina', 'species': 'tibicen', 'authority': '(Latham, 1801)',
               'original': 'Coracias tibicen Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/australian-magpie/18856.html',
               'afd_url': 'https://biodiversity.org.au/afd/taxa/Gymnorhina'},
    'kookaburra': {'order': 'Coraciiformes', 'family': 'Alcedinidae', 'genus': 'Dacelo', 'species': 'novaeguineae', 'authority': '(Hermann, 1783)',
                   'original': 'Alcedo novaeguineae Hermann, 1783', 'ioc_url': 'https://www.worldbirdnames.com/bird/laughing-kookaburra/9996.html',
                   'gbif_url': 'https://gbif.org/species/2475648'},
    'wattlebird': {'order': 'Passeriformes', 'family': 'Meliphagidae', 'genus': 'Anthochaera', 'species': 'carunculata', 'authority': '(Shaw, 1790)',
                   'original': 'Merops carunculata Shaw, 1790', 'ioc_url': 'https://www.worldbirdnames.com/bird/red-wattlebird/17328.html',
                   'gbif_url': 'https://www.gbif.org/species/2487144'},
    'rosella': {'order': 'Psittaciformes', 'family': 'Psittaculidae', 'genus': 'Platycercus', 'species': 'elegans', 'authority': '(Gmelin, 1788)',
                'original': 'Psittacus elegans Gmelin, 1788', 'ioc_url': 'https://www.worldbirdnames.com/bird/crimson-rosella/12188.html',
                'gbif_url': 'https://www.gbif.org/species/2479311'},
    'lyrebird': {'order': 'Passeriformes', 'family': 'Menuridae', 'genus': 'Menura', 'species': 'novaehollandiae', 'authority': 'Latham, 1801',
                 'original': 'Menura novaehollandiae Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/superb-lyrebird/16977.html',
                 'gbif_url': 'https://www.gbif.org/species/2488980'},
    'butcherbird': {'order': 'Passeriformes', 'family': 'Artamidae', 'genus': 'Cracticus', 'species': 'nigrogularis', 'authority': '(Gould, 1837)',
                    'original': 'Vanga nigrogularis Gould, 1837', 'ioc_url': 'https://www.worldbirdnames.com/bird/pied-butcherbird/18849.html',
                    'gbif_url': 'https://www.gbif.org/species/2489439'},
    'whipbird': {'order': 'Passeriformes', 'family': 'Psophodidae', 'genus': 'Psophodes', 'species': 'olivaceus', 'authority': '(Latham, 1801)',
                 'original': 'Corvus olivaceus Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/eastern-whipbird/18289.html',
                 'gbif_url': 'https://www.gbif.org/species/2495057'},
    'bellminer': {'order': 'Passeriformes', 'family': 'Meliphagidae', 'genus': 'Manorina', 'species': 'melanophrys', 'authority': '(Latham, 1801)',
                  'original': 'Turdus melanophrys Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/bell-miner/17268.html',
                  'gbif_url': 'https://www.gbif.org/species/2487364'},
    'cockatoo': {'order': 'Psittaciformes', 'family': 'Cacatuidae', 'genus': 'Cacatua', 'species': 'galerita', 'authority': '(Latham, 1790)',
                 'original': 'Psittacus galerita Latham, 1790', 'ioc_url': 'https://www.worldbirdnames.com/bird/sulphur-crested-cockatoo/11910.html',
                 'gbif_url': 'https://www.gbif.org/species/2479888'},
    'lorikeet': {'order': 'Psittaciformes', 'family': 'Psittaculidae', 'genus': 'Trichoglossus', 'species': 'moluccanus', 'authority': '(Gmelin, 1788)',
                 'original': 'Psittacus moluccanus Gmelin, 1788', 'ioc_url': 'https://www.worldbirdnames.com/bird/rainbow-lorikeet/12399.html',
                 'gbif_url': 'https://www.gbif.org/species/2479694'},
    'curlew': {'order': 'Charadriiformes', 'family': 'Burhinidae', 'genus': 'Burhinus', 'species': 'grallarius', 'authority': '(Latham, 1801)',
               'original': 'Charadrius grallarius Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/bush-thick-knee/5853.html',
               'gbif_url': 'https://www.gbif.org/species/2482098'},
    'boobook': {'order': 'Strigiformes', 'family': 'Strigidae', 'genus': 'Ninox', 'species': 'boobook', 'authority': '(Latham, 1801)',
                'original': 'Strix boobook Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/southern-boobook/9385.html',
                'gbif_url': 'https://www.gbif.org/species/2497828'},
    'raven': {'order': 'Passeriformes', 'family': 'Corvidae', 'genus': 'Corvus', 'species': 'mellori', 'authority': 'Mathews, 1912',
              'original': 'Corvus marianae mellori Mathews, 1912', 'ioc_url': 'https://www.worldbirdnames.com/bird/little-raven/20400.html',
              'gbif_url': 'https://www.gbif.org/species/2482490'},
    'wagtail': {'order': 'Passeriformes', 'family': 'Rhipiduridae', 'genus': 'Rhipidura', 'species': 'leucophrys', 'authority': '(Latham, 1801)',
                'original': 'Turdus leucophrys Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/willie-wagtail/19296.html',
                'gbif_url': 'https://www.gbif.org/species/5231722'},
    'frogmouth': {'order': 'Caprimulgiformes', 'family': 'Podargidae', 'genus': 'Podargus', 'species': 'strigoides', 'authority': '(Latham, 1801)',
                  'original': 'Caprimulgus strigoides Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/tawny-frogmouth/3375.html',
                  'gbif_url': 'https://www.gbif.org/species/2497109'},
    'galah': {'order': 'Psittaciformes', 'family': 'Cacatuidae', 'genus': 'Eolophus', 'species': 'roseicapilla', 'authority': '(Vieillot, 1817)',
              'original': 'Cacatua roseicapilla Vieillot, 1817', 'ioc_url': 'https://www.worldbirdnames.com/bird/galah/11881.html',
              'gbif_url': 'https://www.gbif.org/species/2479598'},
    'gangang': {'order': 'Psittaciformes', 'family': 'Cacatuidae', 'genus': 'Callocephalon', 'species': 'fimbriatum', 'authority': '(Grant, 1803)',
                'original': 'Psittacus fimbriatus Grant, 1803', 'ioc_url': 'https://www.worldbirdnames.com/bird/gang-gang-cockatoo/11877.html',
                'gbif_url': 'https://www.gbif.org/species/2480030'},
    'blackcockatoo': {'order': 'Psittaciformes', 'family': 'Cacatuidae', 'genus': 'Zanda', 'species': 'funerea', 'authority': '(Shaw, 1794)',
                      'original': 'Psittacus funereus Shaw, 1794', 'ioc_url': 'https://www.worldbirdnames.com/bird/yellow-tailed-black-cockatoo/11873.html',
                      'gbif_url': 'https://www.gbif.org/species/10759934'},
    'tui': {'order': 'Passeriformes', 'family': 'Meliphagidae', 'genus': 'Prosthemadera', 'species': 'novaeseelandiae', 'authority': '(Gmelin, 1788)',
            'original': 'Merops novaeseelandiae Gmelin, 1788', 'ioc_url': 'https://www.worldbirdnames.org/new/ioc-lists/master-list-2/',
            'gbif_url': 'https://www.gbif.org/species/2487029'},
    'helmeted': {'order': 'Passeriformes', 'family': 'Meliphagidae', 'genus': 'Lichenostomus', 'species': 'melanops', 'authority': '(Latham, 1801)',
                 'original': 'Turdus melanops Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/yellow-tufted-honeyeater/17258.html',
                 'gbif_url': 'https://www.gbif.org/species/2486903'},
    'fairywren': {'order': 'Passeriformes', 'family': 'Maluridae', 'genus': 'Malurus', 'species': 'cyaneus', 'authority': '(Ellis, 1782)',
                  'original': 'Motacilla cyanea Ellis, 1782', 'ioc_url': 'https://www.worldbirdnames.com/bird/superb-fairywren/17161.html',
                  'gbif_url': 'https://www.gbif.org/species/2487516'},
    'shrikethrush': {'order': 'Passeriformes', 'family': 'Pachycephalidae', 'genus': 'Colluricincla', 'species': 'harmonica', 'authority': '(Latham, 1801)',
                     'original': 'Turdus harmonicus Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/gray-shrikethrush/18512.html',
                     'gbif_url': 'https://www.gbif.org/species/2482357'},
    'whistler': {'order': 'Passeriformes', 'family': 'Pachycephalidae', 'genus': 'Pachycephala', 'species': 'pectoralis', 'authority': '(Latham, 1801)',
                 'original': 'Muscicapa pectoralis Latham, 1801', 'ioc_url': 'https://www.worldbirdnames.com/bird/golden-whistler/18614.html',
                 'gbif_url': 'https://www.gbif.org/species/5959188'},
    'cardinal': {'order': 'Passeriformes', 'family': 'Cardinalidae', 'genus': 'Cardinalis', 'species': 'cardinalis', 'authority': '(Linnaeus, 1758)',
                 'original': 'Loxia cardinalis Linnaeus, 1758', 'ioc_url': 'https://www.worldbirdnames.com/bird/northern-cardinal/30864.html',
                 'gbif_url': 'https://www.gbif.org/species/2490384'},
    'robin': {'order': 'Passeriformes', 'family': 'Muscicapidae', 'genus': 'Erithacus', 'species': 'rubecula', 'authority': '(Linnaeus, 1758)',
              'original': 'Motacilla rubecula Linnaeus, 1758', 'ioc_url': 'https://www.worldbirdnames.com/bird/european-robin/26438.html',
              'gbif_url': 'https://www.gbif.org/species/2492462'},
    'quetzal': {'order': 'Trogoniformes', 'family': 'Trogonidae', 'genus': 'Pharomachrus', 'species': 'mocinno', 'authority': 'de la Llave, 1832',
                'original': 'Pharomachrus mocinno de la Llave, 1832', 'ioc_url': 'https://www.worldbirdnames.org/new/ioc-lists/master-list-2/',
                'gbif_url': 'https://www.gbif.org/species/2496723'},
    'pigeon': {'order': 'Columbiformes', 'family': 'Columbidae', 'genus': 'Columba', 'species': 'livia', 'authority': 'Gmelin, 1789',
               'original': 'Columba domestica livia Gmelin, 1789', 'ioc_url': 'https://www.worldbirdnames.org/new/ioc-lists/master-list-2/',
               'gbif_url': 'https://www.gbif.org/species/2495414'},
}
TAXONOMY_LIST = 'IOC World Bird List'

SCIENCE = [
    {'title': 'Amador, Perl, Mindlin & Margoliash (2013). Elemental gesture dynamics are encoded by song premotor cortical neurons. Nature 495, 59-64', 'url': 'https://doi.org/10.1038/nature11967'},
    {'title': 'Mindlin (2017). Nonlinear dynamics in the study of birdsong. Chaos 27, 092101', 'url': 'https://doi.org/10.1063/1.4986932'},
    {'title': 'Perl, Arneodo, Amador, Goller & Mindlin (2011). Reconstruction of physiological instructions from zebra finch song. Phys. Rev. E 84, 051909', 'url': 'https://doi.org/10.1103/PhysRevE.84.051909'},
    {'title': 'Riede, Suthers, Fletcher & Blevins (2006). Songbirds tune their vocal tract to the fundamental frequency of their song. PNAS 103, 5543-5548', 'url': 'https://doi.org/10.1073/pnas.0601262103'},
    {'title': 'Suthers (1990). Contributions to birdsong from the left and right sides of the intact syrinx. Nature 347, 473-477', 'url': 'https://doi.org/10.1038/347473a0'},
    {'title': 'Hoese, Podos, Boetticher & Nowicki (2000). Vocal tract function in birdsong production: experimental manipulation of beak movements. J. Exp. Biol. 203, 1845-1855', 'url': 'https://doi.org/10.1242/jeb.203.12.1845'},
    {'title': 'Beckers, Nelson & Suthers (2004). Vocal-tract filtering by lingual articulation in a parrot. Current Biology 14, 1592-1597', 'url': 'https://doi.org/10.1016/j.cub.2004.08.057'},
]
# extra science per body type
SCIENCE_BIRD = {
    'tui': [{'title': 'Hill & Ji (2014). Categorisation of common syllable types in the complex vocalisations of tui (Prosthemadera novaeseelandiae). Notornis 61, 54-56', 'url': 'https://www.birdsnz.org.nz/wp-content/uploads/2021/12/Hill___Ji_2014.pdf'}],
    'fairywren': [{'title': 'Colombelli-Négrel, Hauber, Robertson, Sulloway, Hoi, Griggio & Kleindorfer (2012). Embryonic learning of vocal passwords in superb fairy-wrens reveals intruder cuckoo nestlings. Current Biology 22, 2155-2160', 'url': 'https://doi.org/10.1016/j.cub.2012.09.025'}],
    'frogmouth': [{'title': 'Riede, Eliason, Miller, Goller & Clarke (2016). Coos, booms, and hoots: the evolution of closed-mouth vocal behavior in birds. Evolution 70, 1734-1746', 'url': 'https://doi.org/10.1111/evo.12988'}],
    'galah': [{'title': 'Pidgeon (1981). Calls of the galah Cacatua roseicapilla and some comparisons with four other species of Australian parrot. Emu 81, 158-168', 'url': 'https://doi.org/10.1071/MU9810158'},
              {'title': 'Larsen & Goller (2002). Direct observation of syringeal muscle function in songbirds and a parrot. J. Exp. Biol. 205, 25-35', 'url': 'https://doi.org/10.1242/jeb.205.1.25'}],
    'gangang': [{'title': 'Fletcher (2000). A class of chaotic bird calls? J. Acoust. Soc. Am. 108, 821-826', 'url': 'https://doi.org/10.1121/1.429615'}],
    'cockatoo': [{'title': 'Fletcher (2000). A class of chaotic bird calls? J. Acoust. Soc. Am. 108, 821-826', 'url': 'https://doi.org/10.1121/1.429615'},
                 {'title': 'Larsen & Goller (2002). Direct observation of syringeal muscle function in songbirds and a parrot. J. Exp. Biol. 205, 25-35', 'url': 'https://doi.org/10.1242/jeb.205.1.25'},
                 {'title': 'Ohms, Beckers, ten Cate & Suthers (2012). Vocal tract articulation revisited: the case of the monk parakeet. J. Exp. Biol. 215, 85-92', 'url': 'https://doi.org/10.1242/jeb.064717'}],
    'curlew': [{'title': 'Riede, Eliason, Miller, Goller & Clarke (2016). Coos, booms, and hoots: the evolution of closed-mouth vocal behavior in birds. Evolution 70, 1734-1746', 'url': 'https://doi.org/10.1111/evo.12988'}],
    'boobook': [{'title': 'Miller (1934). The vocal apparatus of some North American owls. Condor 36, 204-213', 'url': 'https://doi.org/10.2307/1363856'},
                {'title': 'Riede, Eliason, Miller, Goller & Clarke (2016). Coos, booms, and hoots: the evolution of closed-mouth vocal behavior in birds. Evolution 70, 1734-1746', 'url': 'https://doi.org/10.1111/evo.12988'},
                {'title': 'Fletcher (2000). A class of chaotic bird calls? J. Acoust. Soc. Am. 108, 821-826', 'url': 'https://doi.org/10.1121/1.429615'}],
    'lyrebird': [{'title': 'Robinson & Curtis (1996). The vocal displays of the lyrebirds (Menuridae). Emu 96, 258-275', 'url': 'https://doi.org/10.1071/MU9960258'},
                 {'title': 'Dalziell, Maisey, Magrath & Welbergen (2021). Male lyrebirds create a complex acoustic illusion of a mobbing flock during courtship and copulation. Current Biology 31, 1970-1976', 'url': 'https://doi.org/10.1016/j.cub.2021.02.003'}],
    'butcherbird': [{'title': 'Janney, Taylor, Scharff, Rothenberg, Parra, Tchernichovski (2016). Temporal regularity increases with repertoire complexity in the Australian pied butcherbird\'s song. R. Soc. Open Sci. 3, 160357', 'url': 'https://doi.org/10.1098/rsos.160357'}],
    'whipbird': [{'title': 'Mennill & Rogers (2006). Whip it good! Geographic consistency in male songs and variability in female songs of the duetting eastern whipbird. J. Avian Biol. 37, 93-100', 'url': 'https://doi.org/10.1111/j.0908-8857.2006.03548.x'}],
    'cardinal': [{'title': 'Suthers (1997). Peripheral control and lateralization of birdsong. J. Neurobiol. 33, 632-652', 'url': 'https://doi.org/10.1002/(SICI)1097-4695(19971105)33:5<632::AID-NEU10>3.0.CO;2-B'}],
    'pigeon': [{'title': 'Goller & Larsen (1997). In situ biomechanics of the syrinx and sound generation in pigeons. J. Exp. Biol. 200, 2165-2176', 'url': 'https://doi.org/10.1242/jeb.200.16.2165'},
               {'title': 'Riede, Eliason, Miller, Goller & Clarke (2016). Coos, booms, and hoots: the evolution of closed-mouth vocal behavior in birds. Evolution 70, 1734-1746', 'url': 'https://doi.org/10.1111/evo.12988'}],
    'quetzal': [{'title': 'Riede, Eliason, Miller, Goller & Clarke (2016). Coos, booms, and hoots: the evolution of closed-mouth vocal behavior in birds. Evolution 70, 1734-1746 (trogons: open-mouth callers)', 'url': 'https://doi.org/10.1111/evo.12988'}],
}
# What is known about this species' voice, and how Carol's model relates to it.
MODEL_NOTES = {
    'helmeted': 'The helmeted honeyeater (Lichenostomus melanops cassidix), Victoria\'s bird emblem, is a critically endangered subspecies of the yellow-tufted honeyeater, and no public recordings of it exist. So this preset is fitted to the yellow-tufted honeyeater in Victoria and NSW instead: clear whistles at about 2.5-3.7 kHz and harsh, noisy "chop" calls. The plate shows Gould\'s helmeted honeyeater. Carol uses its general songbird model.',
    'fairywren': 'The superb fairywren\'s "reel" is a fast run of 10-20 notes a second, mostly at 4.5-8.5 kHz, sung by both sexes. Mothers even teach their eggs a "password" note before they hatch (Colombelli-Négrel et al. 2012). Such fast, high notes push Carol\'s general songbird model hard.',
    'shrikethrush': 'The grey shrike-thrush is one of Australia\'s finest songsters: rich, pure whistles at about 0.9-3.5 kHz with steep slurs, the lowest and most tonal of the Victorian songbirds here. Carol uses its general songbird model.',
    'whistler': 'The golden whistler sings ringing whistles at about 2-3.6 kHz that end in a whip-crack, a sweep across about 2-7 kHz in a fraction of a second. Carol uses its general songbird model.',
    'raven': 'Little ravens call with the bill open, in deep harmonic "ah-ah-ah" notes: a fundamental of only about 200-330 Hz with strong bands near 1.2-1.6 and 2.1-2.5 kHz, probably the throat and mouth ringing. Carol uses its general songbird model, which gives ravens the same two-sided syrinx as the smallest songbirds.',
    'wagtail': 'The willie wagtail sings clear whistles and slurs at about 2.5-5 kHz ("sweet pretty creature"), and scolds with a "chit-chit" rattle of broadband clicks about 8 times a second. Carol uses its general songbird model.',
    'frogmouth': 'Frogmouths are not owls: they are related to nightjars, and their syrinx sits down in the two bronchi (Beddard 1886). Nobody has documented whether the "oom" is made with the bill shut. It is almost a pure tone at about 250-350 Hz, low for a bird this size, which hints at closed-mouth calling like a dove, but the only close relative studied (a nightjar) calls with its mouth open (Riede et al. 2016). Carol follows that evidence and uses its open-mouth non-songbird model; see the dove model\'s score on the "How Carol sings it" tab for comparison.',
    'galah': 'Galahs have a parrot\'s single sound source, with membranes in the windpipe and a muscular tongue that shapes the sound (Larsen & Goller 2002; Beckers et al. 2004). Their calls are arched, buzzy notes with most energy at about 3-5 kHz; a study of wild galahs found nine distinct call structures (Pidgeon 1981). Carol uses its parrot model.',
    'gangang': 'The gang-gang\'s "creaky gate" is a chaotic call: a broad, rough spectrum peaking near 2.5 kHz, slightly higher than the sulphur-crested cockatoo\'s (Fletcher 2000, who studied exactly this species). Carol uses its parrot model, pushed into its rough, chaotic regime by turbulence and labial closure.',
    'blackcockatoo': 'The yellow-tailed black-cockatoo\'s wailing "kee-ow" is a clean, rising and falling harmonic stack with a fundamental of about 1 kHz, much purer than other cockatoos\' screeches. No acoustic study of this species exists, so Carol uses its general parrot model.',
    'tui': 'The tūī is a songbird whose two-sided syrinx lets it sing two notes at once: in our recordings a bell-like note is followed by two unrelated tones together (about 1.1 and 1.5 kHz), which one sound source cannot make. Its song mixes clear bell notes and harmonic stacks with clicks, croaks and wheezes (Hill & Ji 2014 found six syllable types). Carol fits its songbird model, second voice included, to song, bell phrases and chatter. No tūī syrinx study exists yet, so the two-voice reading comes from the sound itself.',
    'cockatoo': 'The cockatoo\'s screech is chaotic rather than a clean tone with overtones: a broad, noisy spectrum peaking near 2.5 kHz, radiating at least 100 mW (Fletcher 2000). In its relative the cockatiel, one source does the work: membranes drawn into the windpipe like a slot, moved by two small muscles (Larsen & Goller 2002). Carol uses its parrot model, with the turbulence and labial closure it found pushing the voice into that rough, chaotic regime.',
    'lorikeet': 'There is no study of the lorikeet\'s voice itself, so Carol uses its parrot model: one sound source, a short windpipe and tongue-shaped mouth resonances, which parrots use the way we shape vowels (Beckers et al. 2004). xeno-canto restricts lorikeet recordings for conservation reasons, so this preset was fitted to openly licensed iNaturalist recordings from Australia instead.',
    'curlew': 'Stone-curlews call with the beak open (Riede et al. 2016). There is no study of their syrinx, so Carol uses its general non-songbird model: two membranes where the windpipe meets the bronchi (the same model as the kookaburra and quetzal). The wailing notes sit mostly at about 1.5-2.8 kHz.',
    'boobook': 'Owls have a bronchial syrinx: two sound sources a little way down the bronchi (Miller 1934). Whether owls hoot with the beak shut is not settled: a survey coded every owl it checked as calling with the mouth open (Riede et al. 2016), though great horned owls have been described hooting with the bill closed and the throat swollen. Carol follows the survey and uses its open-mouth non-songbird model. The boobook\'s hoot is nearly a pure tone (Fletcher 2000): about 650-780 Hz for "boo", a little lower for "book".',
    'lyrebird': 'The lyrebird is a songbird, but an unusual one: its syrinx has only three pairs of intrinsic muscles, where most songbirds have four or more (Ames 1971). Even so it copies other birds, cameras and chainsaws so well that most of a male\'s song (about 70-80%) is mimicry. Carol fits its general songbird model to the lyrebird\'s song, so each preset call is one stretch of that song, mimicry included.',
    'butcherbird': 'Pied butcherbirds sing slow, pure, flute-like phrases, usually between about 880 Hz and 3.3 kHz (Hollis Taylor), and reuse the same motifs at regular intervals (Janney et al. 2016). There is no syrinx study for this species, so Carol uses its general songbird model, which suits their clean whistles well.',
    'whipbird': 'The whipbird\'s famous crack is a duet: the male holds a whistle near 4 kHz, then whips it up to about 8 kHz and down to 1.5 kHz in a fraction of a second, and the female answers straight away (Mennill & Rogers 2006). Such a fast sweep is a hard test for any model of the syrinx. Carol uses its general songbird model.',
    'bellminer': 'The bell miner\'s "tink" is a short, sharp attack followed by a pure tone of about 2.5-3.1 kHz that fades like a struck bell; each bird rings at a slightly different pitch. No study has looked at this species\' syrinx, so Carol uses its general songbird model.',
    'cardinal': 'Cardinals sing low notes (below about 3.5 kHz) with the left side of the syrinx and high notes with the right, and switch sides seamlessly in the middle of a sweep (Suthers 1997). They also re-size the throat cavity to follow the note, from about 2 ml at 1.5-2 kHz to under 1 ml above 5 kHz, and open the beak wider for high notes (Riede et al. 2006 measured exactly this species). Carol\'s songbird model does both, with the side switch set to 3.5 kHz.',
    'robin': 'No study has measured the robin\'s syrinx directly, so Carol uses the general songbird model: two independent sides, a throat cavity that follows the note and a beak that opens for high notes. Robin song runs from about 2 kHz up to 9 kHz, and the thin "tsee" calls sit at 7-9 kHz.',
    'pigeon': 'Pigeons coo with the beak and nostrils shut. The syrinx membranes make a tone with strong 2nd and 3rd harmonics; the windpipe and the inflated oesophagus then filter them out, so the coo comes out almost pure (Riede et al. 2004). In ring doves the inflated sac is about 35 x 50 mm, rings sharply (Q about 10) and adds about 6 dB of output compared with an open beak (Fletcher et al. 2004). The rock dove\'s coo sits around 300-500 Hz. Carol models this with its dove body: one source, a windpipe, and a neck-sac resonance radiating through the skin.',
    'quetzal': 'Nobody has studied a trogon\'s syrinx yet. The one trogon checked in a large survey of closed-mouth calling (Riede et al. 2016) called with its mouth open, so Carol does not use the closed-beak dove model here, even though it scored slightly higher (82% against 81%). Instead the quetzal uses the general non-songbird model: two coupled membranes where the windpipe meets the bronchi (the same model as the kookaburra). Its song notes are mellow downward slurs at about 0.75-1.1 kHz.',
}
SCIENCE_BODY = {
    'dove': [
        {'title': 'Riede, Beckers, Blevins & Suthers (2004). Inflation of the esophagus and vocal tract filtering in ring doves. J. Exp. Biol. 207, 4025-4036', 'url': 'https://doi.org/10.1242/jeb.01256'},
        {'title': 'Fletcher, Riede, Beckers & Suthers (2004). Vocal tract filtering and the "coo" of doves. J. Acoust. Soc. Am. 116, 3750-3756', 'url': 'https://doi.org/10.1121/1.1811491'},
    ],
}
LICENCE_NOTE = ('Call shapes and fitted settings are derived from xeno-canto recordings licensed CC BY-NC-SA 4.0, '
                'so each preset is shared under CC BY-NC-SA 4.0 with credit to the recordists above. '
                'Gould plates are public domain.')


def short_licence(r):
    u = r.get('licence_url', '')
    if 'publicdomain' in u: return 'CC0' if 'zero' in u else 'Public domain'
    if 'licenses/' in u:
        k, ver = (u.split('licenses/')[1].strip('/').split('/') + ['4.0'])[:2]
        return f"CC {k.upper()} {ver}"
    return r.get('licence_name', '')


def plate_caption(img):
    import re
    v = str(img.get('volume') or '')
    m = re.match(r'Part (\w+)', v)
    vol = f"part {m.group(1)}, " if m else (f"vol. {v}, " if v else '')
    pm = re.match(r'(\d+)', str(img.get('plate') or ''))
    pl = f"pl. {pm.group(1)}: " if pm else ''
    if not pm and vol: vol = vol[:-2] + ': '
    work = img.get('work', 'John Gould, The Birds of Australia').split(' (')[0]
    if img.get('artist') and img['artist'] not in work: work = img['artist'] + ', ' + work
    return f"{work}, {vol}{pl}{str(img.get('name_on_plate')).rstrip('.')} ({img.get('gould_common_name')})"


def plate_entry(img, path):
    """One plate of a bird's gallery, as the app shows and credits it."""
    import re
    work = img.get('work', 'John Gould, The Birds of Australia')
    artist = img.get('artist') or work.split(',')[0]
    years = re.findall(r'1[6-9]\d\d', str(img.get('year') or '') + ' ' + work)
    cap = plate_caption(img)
    return {'image': path, 'caption': cap, 'artist': artist, 'year': years[0] if years else '',
            'credit': cap + '. ' + (img.get('artist_credit_on_plate') or '') + ' ' + (img.get('copy') or ''),
            'url': img.get('source_page_url') or img.get('url'), 'bhl': img.get('bhl_url') or img.get('bhl_page_url'),
            'licence': 'Public domain'}


def licence_note(recs, img):
    lic = sorted({r['licence'] for r in recs if r['used']})
    who = (img.get('artist') or img.get('work', 'Gould').split(',')[0]).split()[-1]
    where = ' and '.join(sorted({r.get('source', 'xeno-canto') for r in recs if r['used']})) or 'xeno-canto'
    return (f"Call shapes and fitted settings are derived from {where} recordings licensed {', '.join(lic) or 'CC BY-NC-SA 4.0'}, "
            'so each preset is shared under CC BY-NC-SA 4.0 with credit to the recordists above. '
            f'{who} plates are public domain.')


# calls the model can't make (kept out of the preset; the match is then the average of the calls that remain)
DROP_CALLS = {
    'cardinal': ['XC1070756'],   # a 0.2 s broadband "chip" click: no syrinx oscillation to fit (17%)
}


def load_gestures(bid):
    g = os.path.join(ROOT, 'fits', 'gestures', bid + '.json')
    return json.load(open(g)) if os.path.exists(g) else None


def load_pgain(bid):
    c = os.path.join(ROOT, 'fits', 'gestures', bid + '.cal.json')
    return json.load(open(c))['pgain'] if os.path.exists(c) else 1.0


def build(bid):
    d = os.path.join(ROOT, 'data', bid)
    fit = json.load(open(os.path.join(ROOT, 'fits', bid + '.json')))
    info = json.load(open(os.path.join(d, 'info.json')))
    src = json.load(open(os.path.join(d, 'sources.json')))
    img = src.get('image', {})
    shutil.copy(os.path.join(d, 'plate.jpg'), os.path.join(WEB, 'img', bid + '.jpg'))
    types = {xc: name for name, ids in CALL_TYPES.get(bid, {}).items() for xc in ids}
    count = {}
    calls = []
    # phrases first, then calls; within each, best match first
    drop = set(DROP_CALLS.get(bid, []))
    if drop:
        fit = dict(fit, calls=[c for c in fit['calls'] if c['source'].replace('XC', '') not in {d.replace('XC', '') for d in drop}])
        n = max(1, len(fit['calls']))
        fit['match'] = dict(fit['match'], total=round(sum(c['match']['total'] for c in fit['calls']) / n, 1),
                            pitch_cents=round(sum(c['match']['pitch_cents'] for c in fit['calls']) / n),
                            spec_db=round(sum(c['match']['spec_db'] for c in fit['calls']) / n, 1),
                            loud_db=round(sum(c['match']['loud_db'] for c in fit['calls']) / n, 1))
    for c in sorted(fit['calls'], key=lambda c: (c['kind'] != 'phrase', -c['match']['total'])):
        base = types.get(c['source'].replace('XC', ''), 'Call')
        if c['kind'] == 'phrase' and base == 'Call':
            base = 'Phrase'
        count[base] = count.get(base, 0) + 1
        c['name'] = f"{base} {count[base]}"
        calls.append(c)
    rid = lambda r: 'XC' + r['xc_id'] if r.get('xc_id') else 'INAT' + str(r.get('inat_sound_id'))
    recs = [{'id': rid(r), 'url': r['url'], 'recordist': r['recordist'], 'licence': short_licence(r),
             'licence_url': r['licence_url'], 'location': r.get('location', ''), 'date': r.get('date', ''), 'used': any(c['source'] == rid(r) for c in calls), 'source': r.get('source', 'xeno-canto')}
            for r in src['recordings']]
    caption = plate_caption(img)
    work = img.get('work', 'John Gould, The Birds of Australia').split(' (')[0]
    # the plate gallery: the main plate, then any extra plates in data/<id>/plates/plates.json
    plates = [plate_entry(img, f'img/{bid}.jpg')]
    extra_path = os.path.join(d, 'plates', 'plates.json')
    if os.path.exists(extra_path):
        os.makedirs(os.path.join(WEB, 'img', bid), exist_ok=True)
        for e in json.load(open(extra_path)):
            fn = os.path.join(d, e['file'])
            if not os.path.exists(fn):
                continue
            dest = f"img/{bid}/{os.path.basename(e['file'])}"
            shutil.copy(fn, os.path.join(WEB, dest))
            plates.append(plate_entry(e, dest))
    facts = [{'title': f['title'], 'url': f['url'], 'licence': f.get('licence', ''), 'used_for': f.get('used_for', '')} for f in src.get('facts_sources', [])]
    preset = {
        'id': bid, 'name': info['common_name'], 'sci': info['scientific_name'], 'body': fit['body'], 'collection': COLL_OF.get(bid, 'Australasia'),
        'tags': info.get('tags', {}), 'params': fit['params'], 'scale': fit['scale'], 'match': fit['match'],
        'look': LOOKS.get(bid), 'model_note': MODEL_NOTES.get(bid), 'image': f'img/{bid}.jpg', 'image_caption': caption, 'plates': plates,
        'taxonomy': dict(TAXONOMY.get(bid, {}), list=TAXONOMY_LIST, plate_name=img.get('name_on_plate'), plate_common=img.get('gould_common_name'), plate_artist=img.get('artist') or work.split(',')[0]),
        'info': {'family': info.get('family'), 'overview': info['overview'], 'deep_dive': {k: v for k, v in info['deep_dive'].items() if k != 'indigenous_names'}},
        'sources': {
            'recordings': recs,
            'image': {'credit': caption + '. ' + img.get('artist_credit_on_plate', '') + ' ' + img.get('copy', ''),
                      'url': img.get('source_page_url') or img.get('url'), 'bhl': img.get('bhl_url') or img.get('bhl_page_url'), 'source': 'Scan', 'licence': 'Public domain'},
            'plates': plates,
            'facts': facts, 'science': SCIENCE + SCIENCE_BODY.get(fit['body'], []) + SCIENCE_BIRD.get(bid, []), 'licence_note': licence_note(recs, img),
        },
        'calls': calls,
        'style': carol_style.learn(calls, load_gestures(bid), CALL_TYPES.get(bid), load_pgain(bid)),
    }
    json.dump(preset, open(os.path.join(WEB, 'presets', bid + '.json'), 'w'), separators=(',', ':'))
    t = TAXONOMY.get(bid, {})
    return {'id': bid, 'name': preset['name'], 'sci': preset['sci'], 'authority': t.get('authority'), 'order': t.get('order'), 'family': t.get('family'),
            'body': preset['body'], 'tags': preset['tags'], 'collection': preset['collection'],
            'family_name': FAMILY_NAMES.get(t.get('family'), t.get('family')), 'tax': list(tax_key(t))[:2],
            'image': preset['image'], 'image_caption': caption, 'match': fit['match']['total'],
            'plates': [{'image': p['image'], 'caption': p['caption'], 'artist': p['artist'], 'year': p['year']} for p in plates]}


def main():
    os.makedirs(os.path.join(WEB, 'presets'), exist_ok=True); os.makedirs(os.path.join(WEB, 'img'), exist_ok=True)
    idx_path = os.path.join(WEB, 'presets', 'index.json')
    old = {b['id']: b for b in json.load(open(idx_path))['birds']} if os.path.exists(idx_path) else {}
    for bid in (sys.argv[1:] or BIRDS):
        if os.path.exists(os.path.join(ROOT, 'fits', bid + '.json')):
            old[bid] = build(bid); print('built', bid, old[bid]['match'])
    for b in old.values():   # older index entries: move them to their realm
        b['collection'] = COLL_OF.get(b['id'], b.get('collection'))
    coll_rank = {c: i for i, c in enumerate(COLLECTIONS)}
    birds = sorted((v for v in old.values() if v['id'] in COLL_OF),
                   key=lambda b: (coll_rank[b['collection']], tax_key(TAXONOMY.get(b['id'], {}))))
    colls = [dict(name=c, count=sum(1 for b in birds if b['collection'] == c), cover=bs[0], **COLLECTION_INFO.get(c, {}))
             for c, bs in COLLECTIONS.items() if any(b['collection'] == c for b in birds)]
    json.dump({'collections': colls, 'birds': birds}, open(idx_path, 'w'), indent=1)


if __name__ == '__main__':
    main()
