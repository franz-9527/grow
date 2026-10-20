VEGETABLES = [
    {"name": "青菜", "kind": "leafy", "stages": ["播种期", "出苗期", "幼苗期", "莲座期", "采收期"], "days": 35},
    {"name": "生菜", "kind": "leafy", "stages": ["播种期", "幼苗期", "生长期", "结球期", "采收期"], "days": 50},
    {"name": "菠菜", "kind": "leafy", "stages": ["播种期", "出苗期", "生长期", "采收期"], "days": 45},
    {"name": "小白菜", "kind": "leafy", "stages": ["播种期", "幼苗期", "生长期", "采收期"], "days": 32},
    {"name": "番茄", "kind": "tomato", "stages": ["育苗期", "定植期", "开花期", "结果期", "转色期", "采收期"], "days": 100},
    {"name": "辣椒", "kind": "pepper", "stages": ["育苗期", "定植期", "开花期", "结果期", "采收期"], "days": 110},
    {"name": "茄子", "kind": "tomato", "stages": ["育苗期", "定植期", "开花期", "结果期", "采收期"], "days": 120},
    {"name": "黄瓜", "kind": "loofah", "stages": ["播种期", "幼苗期", "伸蔓期", "开花期", "结果期", "采收期"], "days": 65},
    {"name": "丝瓜", "kind": "loofah", "stages": ["播种期", "幼苗期", "伸蔓期", "开花期", "结果期", "采收期"], "days": 90},
    {"name": "南瓜", "kind": "loofah", "stages": ["播种期", "幼苗期", "伸蔓期", "开花期", "结果期", "采收期"], "days": 110},
    {"name": "四季豆", "kind": "legume", "stages": ["播种期", "幼苗期", "抽蔓期", "开花期", "结荚期", "采收期"], "days": 75},
    {"name": "香葱", "kind": "scallion", "stages": ["播种期", "出苗期", "分蘖期", "生长期", "采收期"], "days": 75},
    {"name": "大蒜", "kind": "scallion", "stages": ["播种期", "幼苗期", "鳞茎膨大期", "成熟期"], "days": 180},
    {"name": "萝卜", "kind": "root", "stages": ["播种期", "幼苗期", "肉质根膨大期", "采收期"], "days": 70},
    {"name": "胡萝卜", "kind": "root", "stages": ["播种期", "出苗期", "幼苗期", "肉质根膨大期", "采收期"], "days": 90},
    {"name": "西兰花", "kind": "cabbage", "stages": ["育苗期", "定植期", "莲座期", "花球形成期", "采收期"], "days": 85},
    {"name": "卷心菜", "kind": "cabbage", "stages": ["育苗期", "定植期", "莲座期", "结球期", "采收期"], "days": 90},
    {"name": "香菜", "kind": "herb", "stages": ["播种期", "出苗期", "生长期", "抽薹期", "采收期"], "days": 45},
    {"name": "豌豆", "kind": "legume", "stages": ["播种期", "出苗期", "伸蔓期", "开花期", "结荚期", "采收期"], "days": 75},
    {"name": "玉米", "kind": "corn", "stages": ["播种期", "出苗期", "拔节期", "抽穗期", "灌浆期", "采收期"], "days": 100},
    {"name": "草莓", "kind": "strawberry", "stages": ["育苗期", "定植期", "开花期", "结果期", "转色期", "采收期"], "days": 120},
    {"name": "菜花", "kind": "flower", "stages": ["育苗期", "定植期", "莲座期", "花球形成期", "采收期"], "days": 80},
    {"name": "土豆", "kind": "tuber", "stages": ["播种期", "出苗期", "现蕾期", "块茎膨大期", "成熟期"], "days": 100},
    {"name": "蘑菇", "kind": "mushroom", "stages": ["接种期", "发菌期", "出菇期", "采收期"], "days": 45},
]

from urllib.parse import quote


def _commons_source(filename: str) -> str:
    return f"https://commons.wikimedia.org/wiki/File:{quote(filename)}"


# 图鉴图片已经下载到前端静态目录，运行时不再请求 Wikimedia。文件名保持稳定，
# 方便升级包覆盖静态资源，也方便数据库中的资料被手动编辑后继续沿用原图。
LOCAL_THREAT_IMAGES = {
    "蚜虫": "/threats/pest-01.jpg",
    "白粉虱": "/threats/pest-02.jpg",
    "烟粉虱": "/threats/pest-03.jpg",
    "蓟马": "/threats/pest-04.jpg",
    "红蜘蛛": "/threats/pest-05.jpg",
    "菜青虫": "/threats/pest-06.jpg",
    "斜纹夜蛾": "/threats/pest-07.jpg",
    "地老虎": "/threats/pest-08.jpg",
    "潜叶蝇": "/threats/pest-09.jpg",
    "黄曲条跳甲": "/threats/pest-10.jpg",
    "蜗牛和蛞蝓": "/threats/pest-11.jpg",
    "根结线虫": "/threats/pest-12.jpg",
    "瓜实蝇": "/threats/pest-13.jpg",
    "菜螟": "/threats/pest-14.jpg",
    "甘蓝夜蛾": "/threats/pest-15.jpg",
    "白粉病": "/threats/disease-01.jpg",
    "霜霉病": "/threats/disease-02.jpg",
    "炭疽病": "/threats/disease-03.png",
    "叶斑病": "/threats/disease-04.jpg",
    "灰霉病": "/threats/disease-05.jpg",
    "病毒病": "/threats/disease-06.jpg",
    "晚疫病": "/threats/disease-07.jpg",
    "枯萎病": "/threats/disease-08.jpg",
    "软腐病": "/threats/disease-09.jpg",
    "根腐病": "/threats/disease-10.jpg",
    "立枯病和猝倒病": "/threats/disease-11.jpg",
    "黑斑病": "/threats/disease-12.jpg",
    "锈病": "/threats/disease-13.jpg",
    "细菌性角斑病": "/threats/disease-14.jpg",
    "青枯病": "/threats/disease-15.jpg",
}


def _threat(
    kind: str,
    name: str,
    filename: str,
    license_name: str,
    *,
    aliases: list[str],
    crops: list[str],
    symptoms: str,
    suggestion: str,
    season: str,
    severity: str,
) -> dict[str, object]:
    return {
        "kind": kind,
        "name": name,
        "aliases": aliases,
        "crops": crops,
        "symptoms": symptoms,
        "suggestion": suggestion,
        "season": season,
        "severity": severity,
        "imageUrl": LOCAL_THREAT_IMAGES.get(name, ""),
        "sourceUrl": _commons_source(filename),
        "imageCredit": "Wikimedia Commons（原作者见来源页）",
        "license": license_name,
    }


# 图片均来自可复用的 Wikimedia Commons 文件页，并已随站点下载为本地静态资源。
# 界面会保留每张图片的来源入口，方便部署者查看原作者和对应许可；症状与建议为
# 菜园记录的简短提示，不替代现场诊断。
THREATS = [
    _threat("pest", "蚜虫", "Aphids - 27 May 2016.jpg", "CC BY-SA 4.0", aliases=["桃蚜", "菜蚜"], crops=["青菜", "小白菜", "生菜", "番茄", "辣椒", "茄子"], symptoms="嫩叶、芽心成群聚集小虫，叶片卷曲发黏，常伴随蜜露和蚂蚁。", suggestion="先摘除虫量集中的叶芽并用清水冲洗；持续查看叶背，必要时按当地登记标签选用药剂。", season="春秋多发，温暖干燥", severity="中等"),
    _threat("pest", "白粉虱", "Grünkohl Kohlmottenschildlaus-Aleyrodes proletella-JS-1.jpg", "CC BY-SA 4.0", aliases=["温室白粉虱", "小白蛾"], crops=["番茄", "黄瓜", "茄子", "辣椒", "青菜"], symptoms="叶背有白色小虫或若虫，轻碰叶片会成片飞起，叶面易发黄并有蜜露。", suggestion="剪去虫叶、加强通风，并配合黄板监测；重点复查叶背，避免只处理成虫。", season="夏秋高温", severity="中等"),
    _threat("pest", "烟粉虱", "CSIRO ScienceImage 7704 Silverleaf whitefly Bemisia tabaci biotype B.jpg", "CC BY 3.0", aliases=["Bemisia tabaci"], crops=["番茄", "黄瓜", "辣椒", "茄子", "四季豆"], symptoms="叶背密布白色成虫和扁平若虫，植株退绿、发黏，病毒病风险升高。", suggestion="及时隔离重株、清除杂草寄主并连续监测黄板；登记时一并观察是否有花叶或卷叶。", season="夏秋高温干燥", severity="严重"),
    _threat("pest", "蓟马", "Thrips on pepper flower.jpg", "CC BY 4.0", aliases=["葱蓟马", "花蓟马"], crops=["辣椒", "番茄", "黄瓜", "香葱", "豆类"], symptoms="嫩叶、花瓣或果皮出现银白色擦伤斑，叶背可见细长小虫和黑色排泄物。", suggestion="及时摘除受害花叶，保持畦面清洁；清晨或傍晚重点检查嫩梢和花内。", season="春夏干燥", severity="中等"),
    _threat("pest", "红蜘蛛", "Tetranychus urticae on beans leaf.jpg", "CC BY 4.0", aliases=["二斑叶螨", "叶螨"], crops=["番茄", "茄子", "辣椒", "黄瓜", "四季豆"], symptoms="叶面布满细小失绿斑点，叶背可见红褐小螨；严重时有细丝网、叶片焦枯。", suggestion="优先摘除重叶并减轻高温干燥；翻看叶背连续记录，避免只看叶面。", season="夏季高温干燥", severity="严重"),
    _threat("pest", "菜青虫", "Pieris brassicae caterpillar.jpg", "CC BY-SA 3.0", aliases=["菜粉蝶幼虫"], crops=["青菜", "小白菜", "生菜", "萝卜"], symptoms="叶片出现不规则孔洞，叶背或心叶有绿色虫粪，可见绿色毛虫。", suggestion="趁幼虫小人工捕捉并清除虫卵；连续检查心叶和叶背，避免漏掉新孵化幼虫。", season="春秋", severity="中等"),
    _threat("pest", "斜纹夜蛾", "Spodoptera litura late instar caterpillar.jpg", "CC BY-SA 4.0", aliases=["夜盗虫"], crops=["青菜", "番茄", "辣椒", "茄子", "豆类"], symptoms="夜间取食明显，叶片被啃成缺刻或只剩叶脉，幼虫常藏在叶背、土缝。", suggestion="傍晚巡查并人工捕捉，清除卵块；受害扩大时尽快按当地植保建议处置。", season="夏秋", severity="严重"),
    _threat("pest", "地老虎", "Agrotis ipsilon larva.jpg", "CC BY 3.0 US", aliases=["切根虫", "黑地蚕"], crops=["青菜", "番茄", "辣椒", "黄瓜", "萝卜"], symptoms="幼苗近地面茎部被咬断，白天常不见虫，拨开表土可发现卷曲幼虫。", suggestion="傍晚沿苗根周围翻土检查，及时补苗；清除杂草并避免未腐熟有机物堆在苗旁。", season="春秋苗期", severity="严重"),
    _threat("pest", "潜叶蝇", "Grünkohl Minierfliegen Befall-JS-1.jpg", "CC BY-SA 4.0", aliases=["美洲斑潜蝇"], crops=["番茄", "黄瓜", "豆类", "青菜", "香葱"], symptoms="叶片内出现白色弯曲虫道，虫道逐渐变褐；严重时叶片早衰。", suggestion="尽早摘除带新鲜虫道的叶片并带离菜园；用黄板监测成虫发生。", season="春夏秋", severity="中等"),
    _threat("pest", "黄曲条跳甲", "Phyllotreta striolata P1210435a.jpg", "CC BY-SA 4.0", aliases=["跳甲", "菜跳甲"], crops=["青菜", "小白菜", "萝卜", "甘蓝"], symptoms="嫩叶布满细小圆孔，苗期受害时叶片像筛子，受惊可见小甲虫跳跃。", suggestion="苗期覆盖防虫网并保持土壤湿润；早晚检查虫量，及时补播受害严重的小苗。", season="春秋苗期", severity="中等"),
    _threat("pest", "蜗牛和蛞蝓", "Radieschen-Schnecken Befall-2-Josef Schlaghecken.jpg", "CC BY-SA 4.0", aliases=["鼻涕虫", "蛞蝓"], crops=["生菜", "青菜", "小白菜", "草莓"], symptoms="叶片有大块不规则孔洞和黏液痕，阴湿清晨或夜间容易发现。", suggestion="清晨、雨后或夜间人工捡除，清理遮蔽物并改善排水，避免长期潮湿。", season="雨季、阴湿天气", severity="中等"),
    _threat("pest", "根结线虫", "Tomato (Solanum lycopersicum)- Galling from root-knot nematodes.jpg", "CC0", aliases=["根瘤线虫"], crops=["番茄", "黄瓜", "辣椒", "茄子", "豆类"], symptoms="地上部矮化、午间萎蔫，拔株后根系有串珠状膨大根瘤。", suggestion="拔除严重病株并避免带土移栽；记录地块位置，下一茬实行轮作和土壤管理。", season="夏季高温土壤", severity="严重"),
    _threat("pest", "瓜实蝇", "Melon fly (Bactrocera cucurbitae).jpg", "CC BY 3.0 US", aliases=["瓜蝇"], crops=["黄瓜", "丝瓜", "南瓜", "苦瓜"], symptoms="幼果表面有针孔样产卵痕，果实内部蛀食腐烂并早落。", suggestion="及时摘除落果和蛀果，套袋保护幼果；在结果期加密巡查。", season="夏秋结果期", severity="严重"),
    _threat("pest", "菜螟", "Hellula undalis Old World Webworm. Pyralidae - Flickr - gailhampshire.jpg", "CC BY 2.0", aliases=["菜心螟"], crops=["青菜", "小白菜", "甘蓝", "萝卜"], symptoms="幼虫蛀入菜心、叶柄或茎部，心叶萎蔫并有虫粪和丝网。", suggestion="发现蛀孔及时剖查并清除虫株；菜心期提高巡查频率。", season="夏秋", severity="中等"),
    _threat("pest", "甘蓝夜蛾", "M.brassicae4.jpg", "CC BY-SA 4.0", aliases=["菜夜蛾"], crops=["青菜", "小白菜", "甘蓝", "生菜"], symptoms="叶缘和心叶被夜间啃食，留下大缺刻和虫粪，幼虫白天常躲在叶丛。", suggestion="傍晚翻叶检查并人工捕捉；清理残株，减少下一代虫源。", season="夏秋", severity="中等"),
    _threat("disease", "白粉病", "Cucumis melo - powdery mildews (Family Erysiphaceae)-M.E. Bartolo, Bugwood.jpg", "CC BY 3.0", aliases=["粉病"], crops=["黄瓜", "丝瓜", "四季豆", "南瓜"], symptoms="叶面或叶柄出现白色粉状霉层，逐渐连片，叶片发黄早衰。", suggestion="及时剪除病叶，拉开株距并加强通风；浇水尽量避开叶面，连续观察新叶。", season="春秋温差大", severity="中等"),
    _threat("disease", "霜霉病", "Downy mildew on leaves of Cucumis sativus.jpg", "CC BY-SA 4.0", aliases=["黄瓜霜霉病"], crops=["黄瓜", "丝瓜", "青菜", "小白菜"], symptoms="叶面先现黄绿色多角斑，潮湿时叶背有灰紫色霉层，病斑后期干枯。", suggestion="雨后尽快排水通风，摘除重病叶并避免密植；阴雨连绵时加密巡查。", season="春秋多雨", severity="严重"),
    _threat("disease", "炭疽病", "Anthracnose Colletotrichum orbiculare - 1436111.png", "美国政府公有领域", aliases=["瓜类炭疽"], crops=["黄瓜", "丝瓜", "辣椒", "番茄"], symptoms="叶片或果实出现褐色凹陷圆斑，潮湿时病斑中央可见黏状孢子堆。", suggestion="及时带走病果病叶，工具接触后清洁；减少叶面长时间积水。", season="夏秋高温多雨", severity="中等"),
    _threat("disease", "叶斑病", "Septoria leaf spot symptoms on tomato leaf (Septoria lycopersici on Solanum lycopersicum leaf).jpg", "CC BY-SA 4.0", aliases=["番茄斑点病", "Septoria"], crops=["番茄", "辣椒", "青菜", "豆类"], symptoms="老叶先有多个小圆褐斑，常带浅色中心和深色边缘，严重时下部叶片脱落。", suggestion="优先清除下部病叶并改善通风；浇水不要冲溅泥土到叶面。", season="夏秋多雨", severity="中等"),
    _threat("disease", "灰霉病", "Botrytis cinerea-NW-JS-1.jpg", "CC BY-SA 4.0", aliases=["灰霉"], crops=["番茄", "黄瓜", "辣椒", "茄子", "生菜"], symptoms="花、叶或果实出现水渍状软腐，潮湿处长出灰色绒霉。", suggestion="及时摘除带灰霉组织并带离菜园，降低棚内湿度，采收和整枝时避免留下伤口。", season="冬春低温高湿", severity="严重"),
    _threat("disease", "病毒病", "Cucumber mosaic virus symptoms.jpg", "CC BY 3.0 US", aliases=["花叶病毒", "黄瓜花叶病毒"], crops=["黄瓜", "番茄", "辣椒", "茄子", "豆类"], symptoms="新叶花叶、皱缩、畸形或植株矮化，常与蚜虫、粉虱等传毒害虫同时出现。", suggestion="尽快隔离或拔除典型病株，先控制传毒害虫；不要用病株枝叶作堆肥。", season="全生育期", severity="严重"),
    _threat("disease", "晚疫病", "Late blight on tomato leaf (7871756748).jpg", "CC BY 2.0", aliases=["番茄疫病"], crops=["番茄", "马铃薯"], symptoms="叶缘或叶面出现水渍状深褐斑，湿度大时病斑边缘可见白霉，扩展很快。", suggestion="连续阴雨时每日巡查，发现后立即隔离病叶病株并避免叶面浇水。", season="春秋低温多雨", severity="严重"),
    _threat("disease", "枯萎病", "Fusarium oxysporum a1 (1).jpg", "CC BY-SA 4.0", aliases=["镰刀菌枯萎病"], crops=["黄瓜", "番茄", "辣椒", "茄子"], symptoms="植株从下叶开始黄化萎蔫，午间更明显，切开茎基部可见维管束褐变。", suggestion="及时拔除重病株并记录地块，避免连作；下茬优先选择轮作和健康苗。", season="夏季高温", severity="严重"),
    _threat("disease", "软腐病", "Onion (Allium cepa)- Bacterial soft rot.jpg", "CC0", aliases=["细菌性软腐"], crops=["香葱", "大蒜", "白菜", "萝卜"], symptoms="组织变软、渗水、有异味，伤口或积水部位更容易快速腐烂。", suggestion="立即剔除腐烂组织并消毒工具，改善排水；采收时避免机械伤口。", season="高温高湿", severity="严重"),
    _threat("disease", "根腐病", "Corkyroot.jpg", "CC BY-SA 4.0", aliases=["木栓根腐"], crops=["番茄", "黄瓜", "辣椒", "茄子"], symptoms="根系褐变腐烂，地上部生长慢、叶片萎蔫，雨后或浇水后更明显。", suggestion="控水排湿、及时拔除严重株；不要把病根和旧土混入新畦。", season="高温多湿", severity="严重"),
    _threat("disease", "立枯病和猝倒病", "Tomaten Rhizoctonia damping-off, blight and rot (Rhizoctonia solani), J.G.Kühn.jpg", "CC BY 3.0", aliases=["苗期猝倒", "立枯病"], crops=["番茄", "辣椒", "黄瓜", "青菜"], symptoms="幼苗茎基部缢缩变褐，成片倒伏；有时刚出苗便腐烂死亡。", suggestion="育苗期控制浇水和密度，发现病苗及时移除；保持育苗介质和工具清洁。", season="春季育苗期", severity="严重"),
    _threat("disease", "黑斑病", "Alternaria brassicae (Berk.) Sacc. Symptoms on cabbage.JPG", "CC BY-SA 3.0", aliases=["甘蓝黑斑病", "Alternaria"], crops=["青菜", "小白菜", "甘蓝", "萝卜"], symptoms="叶片出现同心轮纹状褐黑病斑，老叶先发病，潮湿时病斑扩大更快。", suggestion="摘除带病老叶，避免连作和叶面久湿；雨后检查下部叶片。", season="夏秋多雨", severity="中等"),
    _threat("disease", "锈病", "Uromyces viciae-fabae.jpg", "CC BY-SA 3.0", aliases=["蚕豆锈病"], crops=["四季豆", "蚕豆", "豌豆"], symptoms="叶片两面或茎上出现橙黄色至褐色粉状孢子堆，后期叶片早衰。", suggestion="及时摘除初发病叶，改善通风并避免过量氮肥；持续记录病斑扩展。", season="春秋温和潮湿", severity="中等"),
    _threat("disease", "细菌性角斑病", "Angular leaf spot of cucumber 5359665.jpg", "CC BY 3.0 US", aliases=["黄瓜角斑病"], crops=["黄瓜", "丝瓜", "南瓜"], symptoms="叶片有受叶脉限制的水渍状多角斑，干后易穿孔；潮湿时叶背可有菌脓。", suggestion="雨后排湿、避免从叶面喷灌；及时清除病叶并给工具消毒。", season="夏秋高湿", severity="中等"),
    _threat("disease", "青枯病", "Ralstonia solanacearum symptoms.jpg", "美国政府公有领域", aliases=["细菌性青枯"], crops=["番茄", "辣椒", "茄子", "马铃薯"], symptoms="植株迅速萎蔫但叶色仍绿，切茎可见褐变，常在高温时成片发生。", suggestion="立即拔除病株及周围土，避免灌溉水串畦；后续实行较长轮作并记录病地。", season="夏季高温多湿", severity="严重"),
]
