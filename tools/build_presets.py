#!/usr/bin/env python3
"""Assemble web/presets/<id>.json (one file per bird) from the fit, info, sources and plate.
Run after tools/fit_all.sh. Usage: build_presets.py [ids...]"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
# Collections, in menu order. A bird's collection is where its recordings and plate come from.
# Collections = zoogeographic realms (where each species is native), as field guides and the IOC list
# group birds; inside each, birds are ordered by the IOC taxonomic sequence (order, then family).
COLLECTIONS = {
    'Australasia': ['magpie', 'kookaburra', 'wattlebird', 'rosella', 'lyrebird', 'butcherbird', 'whipbird', 'bellminer',
                    'cockatoo', 'lorikeet', 'curlew', 'boobook',
                    'helmeted', 'fairywren', 'shrikethrush', 'whistler', 'raven', 'wagtail', 'frogmouth', 'galah', 'gangang', 'blackcockatoo'],
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
                'Pachycephalidae': 'Whistlers', 'Colluricinclidae': 'Shrike-thrushes', 'Artamidae': 'Butcherbirds, magpies and woodswallows',
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
    'cardinal': {'body': [3.9, 2.5, 2.3], 'head': 1.55, 'neck': 0.75, 'tail': 3.4,
                 'beak': {'len': 1.15, 'depth': 0.95, 'curve': 0.2, 'hook': 0},
                 'colors': {'body': '#c41e2a', 'belly': '#d2423a', 'head': '#cf1f2c', 'wing': '#9e2a2b', 'tail': '#8c2526', 'beak': '#e8603c', 'beak2': '#de5534', 'eye': '#2a1a12', 'legs': '#a07468'},
                 'crest': {'len': 1.5, 'back': 0.75, 'w': 0.85, 'color': '#d42530'},
                 'accents': [{'at': [1.15, -0.2, 0.45], 'r': [0.5, 0.48, 0.42], 'rot': 0.3, 'color': '#141414'}]},
    'robin': {'body': [3.8, 2.7, 2.5], 'head': 1.6, 'neck': 0.55, 'tail': 2.6,
              'beak': {'len': 0.95, 'depth': 0.36, 'curve': 0.06, 'hook': 0},
              'colors': {'body': '#7a6a4f', 'belly': '#ede8df', 'head': '#7a6a4f', 'wing': '#6e5d44', 'tail': '#6b5a42', 'beak': '#2a2622', 'beak2': '#2a2622', 'eye': '#111111', 'legs': '#8c6e54'},
              'accents': [{'body': True, 'at': [2.2, 0.9, 0], 'r': [1.8, 1.85, 2.05], 'rot': -0.2, 'color': '#9ea3a6', 'layer': 0},
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


def licence_note(recs, img):
    lic = sorted({r['licence'] for r in recs if r['used']})
    who = (img.get('artist') or img.get('work', 'Gould').split(',')[0]).split()[-1]
    where = ' and '.join(sorted({r.get('source', 'xeno-canto') for r in recs if r['used']})) or 'xeno-canto'
    return (f"Call shapes and fitted settings are derived from {where} recordings licensed {', '.join(lic) or 'CC BY-NC-SA 4.0'}, "
            'so each preset is shared under CC BY-NC-SA 4.0 with credit to the recordists above. '
            f'{who} plates are public domain.')


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
    import re
    v = str(img.get('volume') or '')
    m = re.match(r'Part (\w+)', v)
    vol = f"part {m.group(1)}, " if m else (f"vol. {v}, " if v else '')
    pm = re.match(r'(\d+)', str(img.get('plate') or ''))
    pl = f"pl. {pm.group(1)}: " if pm else ''
    if not pm and vol: vol = vol[:-2] + ': '
    work = img.get('work', 'John Gould, The Birds of Australia').split(' (')[0]
    if img.get('artist') and img['artist'] not in work: work = img['artist'] + ', ' + work
    caption = f"{work}, {vol}{pl}{str(img.get('name_on_plate')).rstrip('.')} ({img.get('gould_common_name')})"
    facts = [{'title': f['title'], 'url': f['url'], 'licence': f.get('licence', ''), 'used_for': f.get('used_for', '')} for f in src.get('facts_sources', [])]
    preset = {
        'id': bid, 'name': info['common_name'], 'sci': info['scientific_name'], 'body': fit['body'], 'collection': COLL_OF.get(bid, 'Australasia'),
        'tags': info.get('tags', {}), 'params': fit['params'], 'scale': fit['scale'], 'match': fit['match'],
        'look': LOOKS.get(bid), 'model_note': MODEL_NOTES.get(bid), 'image': f'img/{bid}.jpg', 'image_caption': caption,
        'taxonomy': dict(TAXONOMY.get(bid, {}), list=TAXONOMY_LIST, plate_name=img.get('name_on_plate'), plate_common=img.get('gould_common_name'), plate_artist=img.get('artist') or work.split(',')[0]),
        'info': {'family': info.get('family'), 'overview': info['overview'], 'deep_dive': {k: v for k, v in info['deep_dive'].items() if k != 'indigenous_names'}},
        'sources': {
            'recordings': recs,
            'image': {'credit': caption + '. ' + img.get('artist_credit_on_plate', '') + ' ' + img.get('copy', ''),
                      'url': img.get('source_page_url') or img.get('url'), 'bhl': img.get('bhl_url') or img.get('bhl_page_url'), 'source': 'Scan', 'licence': 'Public domain'},
            'facts': facts, 'science': SCIENCE + SCIENCE_BODY.get(fit['body'], []) + SCIENCE_BIRD.get(bid, []), 'licence_note': licence_note(recs, img),
        },
        'calls': calls,
    }
    json.dump(preset, open(os.path.join(WEB, 'presets', bid + '.json'), 'w'), separators=(',', ':'))
    t = TAXONOMY.get(bid, {})
    return {'id': bid, 'name': preset['name'], 'sci': preset['sci'], 'authority': t.get('authority'), 'order': t.get('order'), 'family': t.get('family'),
            'body': preset['body'], 'tags': preset['tags'], 'collection': preset['collection'],
            'family_name': FAMILY_NAMES.get(t.get('family'), t.get('family')), 'tax': list(tax_key(t))[:2],
            'image': preset['image'], 'image_caption': caption, 'match': fit['match']['total']}


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
