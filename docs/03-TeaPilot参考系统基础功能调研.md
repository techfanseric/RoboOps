# TeaPilot 参考系统基础功能调研

整理日期：2026-07-05
调研对象：`https://teapilot-web-test.shuxinyc.com/`
参考性质：同类设备/茶饮运营后台参考，不作为照抄对象。

## 1. 调研说明

本次调研目标是了解同类产品当前已经覆盖的基础功能，为 RoboOps - 机器人商业运营平台后续做产品规划、PRD 和竞品对照提供参考。

调研过程：

- 尝试使用浏览器打开 TeaPilot 测试站。
- 测试站前端可访问，标题为“后台管理系统”。
- 登录接口确认存在验证码参数要求，返回 `captchaId不能为空`。为避免绕过验证码，本次没有继续尝试自动登录。
- 进一步抓取并分析前端静态资源、业务页面 chunk、API 调用路径和多语言文案，整理出系统模块和功能范围。

注意：

- 本文档不记录测试账号密码。
- 因未完成验证码登录，菜单权限下的真实可见项、实际数据截图、页面交互细节仍需后续人工登录后补充。
- 但静态前端和 API 已经足够判断其基础功能结构。

## 2. 总体判断

TeaPilot 更像一个“智能茶饮设备统一管理后台”，核心围绕自动制茶/制饮设备的商业运营展开。

它不是单纯 IoT 设备列表，也不是单纯订单后台，而是把以下能力组合到一起：

- 门店/点位管理。
- 设备管理。
- 订单与制作过程管理。
- 饮品、规格、配方管理。
- 物料、料仓、精度、效期管理。
- 清洗方案与维护记录。
- 软件包、固件、H5 版本、升级策略。
- 销售、生产、物料、门店报表。
- 用户、角色、组织、权限。
- 操作日志、数据日志、异步任务。
- 企业微信/钉钉/飞书机器人通知配置。

对 RoboOps 的启发是：真实运营后台不会只做“订单 + 设备状态”，它还会很快长出“配置、下发、维护、报表、权限、日志、通知、版本管理”等一整套运营支撑能力。

## 2.1 结合通话记录的系统定位与参考价值

在 2026-06-27 的通话里，这类系统的定位不是“我们要照着做一个饮品后台”，而是作为三类经验来源之一：

1. 过去大品牌饮品项目里的运营经验。
2. 市面上自动咖啡/奶茶/无人设备的同类产品经验。
3. 己方已有设备 API 和设备管理后台向商业运营后台升级的中间参照。

通话里的原始判断可以概括为：

- 过去合作喜茶、茶百道、茶颜悦色等品牌时，己方主要管设备，运营、配方、订单、退单、异常等由品牌方负责。
- 现在客户变成人形机器人公司，这些公司并不懂饮品/零售/连锁运营，只给 API 没有意义，需要一套能让他们直接运营起来的后台。
- 不能把茶百道等既有客户系统直接搬过来，一方面有版权/客户资产风险，另一方面那些系统不是围绕机器人交互设计的。
- 调研同类产品时，很难直接看到别人的管理后台，能看到的往往是消费者端、截图、试用或通过资料反推。
- 真正要研究的不是页面长什么样，而是“什么人、什么场景、什么权限、什么流程、什么异常分给什么角色处理”。

因此，TeaPilot 对 RoboOps 的参考价值主要在“运营后台的基础盘”和“业务对象抽象”，而不是具体界面或字段命名。

可参考的部分：

- 一个自动化商业设备后台通常会覆盖哪些基础模块：点位/门店、设备、订单、商品、配方/流程、物料、维护、报表、权限、日志、通知、版本。
- 订单不是单点状态，而是一条从下单、支付、下发、制作、出料、完成、异常、退单到报表的履约链路。
- 设备不是只显示在线/离线，还需要日志、重启、调试、模板下发、版本、清洗/维护、物料/料仓等运营动作。
- 后台需要为不同运营角色服务：老板看经营，运营看点位和订单，运维看设备和维护，客服看异常和退款，财务看收支和导出。
- 标准化产品不能按客户一单一改，需要把商品、流程、点位、设备、权限、异常做成可配置对象。

不能直接套用的部分：

- TeaPilot 更偏茶饮设备/机械臂制饮后台，底层语义是“门店、饮品、配方、出茶、物料、料仓、清洗”。
- RoboOps 要面向机器人商业运营，饮品只是第一落地点，底层语义应抽象成“点位、机器人/设备、商品/服务、履约流程、资源消耗、异常、任务”。
- TeaPilot 这类传统制饮后台不一定覆盖人形机器人特有问题，例如机器人判断异常、人机交互异常、人工接管、顾客是否取走的机器人感知误判、多机器人协同等。
- 通话里已经明确，技术 API 不是最大难点，最大难点是把接口串成运营逻辑和角色分工。

一句话结论：

> TeaPilot 是 RoboOps 的“运营后台基础盘参考”，不是 RoboOps 的“产品定义答案”。它帮助我们知道一个自动化商业设备后台至少要覆盖什么，但 RoboOps 必须进一步抽象到机器人商业场景，并补上机器人交互、异常闭环和客户运营分工。

## 3. 可见信息架构

### 3.1 首页/运营看板

前端文案显示首页包含：

- 我要开店/添加门店。
- 关联设备。
- 设备数。
- 订单数。
- 已制作。
- 待制作。
- 日志数。
- 在线/离线设备。
- 未处理事项。
- 今日新增。
- 物料消耗。
- 涉及门店数。

判断：

首页不是纯 BI，而是“运营入口 + 状态总览”。它把门店、设备、订单、日志、物料这些对象放在同一个工作台里。

对 RoboOps 的参考：

- RoboOps 首页应覆盖点位、机器人/设备、订单、异常、任务、收入、待处理事项。
- 首页需要有行动入口，例如新增点位、处理异常、查看离线设备、查看待退款/待人工确认订单。

### 3.2 门店/点位管理

相关页面：

- `ShopManagement`
- `ShopDetail`
- `RegionMgmt`
- `StructureManagement`
- 地图搜索组件

相关接口：

- `shop/add`
- `shop/update`
- `shop/delete`
- `shop/list`
- `shop/get`
- `shop/bind_machine`
- `shop/unbind_machine`
- `settings/shop`
- `settings/shop/update`
- `map/shop/search`
- `regional/list`
- `regional/add`
- `regional/update`
- `regional/delete`
- `organize/list`
- `organize/listadd`

核心字段/功能：

- 门店编码。
- 门店名称。
- 门店类型。
- 门店地址、详细地址、省/市/区/街道。
- 门店电话/联系方式。
- 门店状态。
- 是否 24 小时门店。
- 归属组织/区域。
- 绑定设备。
- 门店设置。
- 查看相关设备。

对 RoboOps 的参考：

- RoboOps 不应只叫“门店”，建议抽象成“点位/场景单元”，饮品亭、无人零售站、机器人服务站都可以纳入。
- 点位要承载位置、营业状态、业务类型、设备绑定、组织归属、运营设置。
- 第一版至少需要点位列表、点位详情、点位绑定设备/机器人、点位状态。

### 3.3 设备管理

相关页面：

- `MachineManagement`
- `MachineDetail`
- `MachineModel`
- `MachineModelDetail`
- `MachineTemplate`
- `MachineTemplateDetail`
- `Calibration`
- `CleanRecord`

相关接口：

- `machine/add`
- `machine/update`
- `machine/delete`
- `machine/list`
- `machine/get`
- `machine/get_by_sn`
- `machine/count_online`
- `machine/reset`
- `machine/restart`
- `machine/debug`
- `machine/enable`
- `machine/disabled`
- `machine/machine_type`
- `machine/machine_hardware`
- `machine/language/list`
- `machine_log/list`
- `machine_template/add`
- `machine_template/edit`
- `machine_template/delete`
- `machine_template/list`
- `machine_template/query`
- `machine_template/machine_list`
- `machine_template/push_machine_template`

核心字段/功能：

- 设备编码/SN。
- 所属门店。
- 设备名称。
- 设备类型。
- 设备状态。
- 在线状态。
- 出厂时间。
- 激活时间。
- App 版本、固件版本、Web 版本。
- 最后上线 IP。
- 上下行日志。
- 调试设备。
- 重启设备。
- 重置设备本地数据，包括饮品、物料、配方、订单、料仓、清洗方案。
- 设备模板下发。
- 设备型号、品牌、厂商。

对 RoboOps 的参考：

- RoboOps 需要把“设备”拆成机器人本体、自动化设备、外围设备、传感器/取货设备等多类对象。
- 设备详情不只是状态展示，还要能支撑远程诊断、日志查看、重启、下发配置、版本查看。
- 对人形机器人场景，需要新增机器人状态、机器人任务、机器人感知/判断异常、人机交互异常。

### 3.4 订单与制作管理

相关页面：

- `OrderManagement`
- `DischargingRecord`

相关接口：

- `order/create/manual`
- `order/list`
- `order/search`
- `order/push`
- `order/count_order`
- `order/make_log`
- `order/make_log/page`
- `order/make_log/export`

核心字段/功能：

- 创建订单。
- 下发订单。
- 订单编号。
- 杯贴码。
- 杯序号。
- 订单来源/订单渠道。
- 所属设备。
- 所属门店。
- 饮品编码/名称。
- 订单状态。
- 制作方式：点餐制作、订单制作、扫码制作。
- 扫码状态、扫码时间。
- 原单创建时间。
- 制作完成时间。
- 制作设备编码。
- 原始规格、匹配规格。
- 取餐号。
- 用户名、手机号。
- 是否热饮。
- 取货方式。
- 是否预定。
- 订单备注。
- 订单详情。
- 配方信息。
- 制作信息。
- 出料详情。
- 同步状态。
- 订单异常。
- 已下单、已制作、已取货、未处理已退单、已制作已退单等状态。

出料记录相关字段：

- 出料类型。
- 出料编码。
- 出料名称。
- 应出量。
- 实出量。
- 是否补充出料。
- 配方单位。
- 门店编码/名称。
- 设备编码。
- 操作时间。

对 RoboOps 的参考：

- 订单中心必须保存完整履约链路，而不是只看支付/完成。
- 订单详情要能展开到“制作/执行日志”和“物料/步骤明细”。
- 对机器人商业运营，订单状态应进一步扩展为：已创建、已支付、待执行、机器人接单、执行中、执行完成、待交付、已交付、未交付、异常、退款中、已退款。
- “下发订单/推送订单”这个动作值得参考。RoboOps 可能需要支持重新下发、人工重试、人工接管。

### 3.5 商品/饮品/规格/配方

相关页面：

- `ProductManagement`
- `ProductDetail`
- `ProductCate`
- `ProductFilter`
- `PropertyDictionary`
- `PropertyDictionaryItem`
- `SpecAlias`
- `SpecFilter`
- `FormulaManagement`
- `FormulaList`
- `FormulaPush`
- `ModalPushDetail`

相关接口：

- `product/brands`
- `product_specs/add`
- `product_specs/delete`
- `product_specs/update_product_specs_order_num`
- `product_specs_group/add`
- `product_specs_group/update`
- `product_specs_group/delete`
- `product_specs_group/update_product_specs_group_order_num`
- `specs_group_template/add`
- `specs_group_template/edit`
- `specs_group_template/delete`
- `specs_group_template/list`
- `specs_group_template/status`
- `specs_template/add`
- `specs_template/edit`
- `specs_template/delete`
- `specs_template/list`
- `specs_template/status`
- `formula/filter/list`
- `formula/filter/add`
- `formula/filter/delete`
- `formula/filter/export`
- `formula/nickname/list`
- `formula/nickname/add`
- `formula/nickname/delete`
- `formula/nickname/export`
- `teaformula/page`
- `teaformula/page_by_product`
- `teaformula/detail`
- `teaformula/save`
- `teaformula/delete`
- `teaformula/import`
- `teaformula/export`
- `teaformula/list`
- `formula/log/list`
- `product_formula/add`
- `product_formula/update`
- `product_formula/check`
- `product_formula/list`
- `product_formula/delete`
- `product_formula/detail`
- `product_formula_log/list`
- `product_formula_log/detail`

核心字段/功能：

- 品牌。
- 饮品/商品编码。
- 饮品/商品名称。
- 分类。
- 是否上架。
- 商品详情。
- 别名。
- 规格。
- 规格组。
- 规格过滤。
- 属性字典。
- 配方 ID。
- 配方编码。
- 配方版本。
- 配方适用区域。
- 基础配方。
- 过渡期配方。
- 关联物料。
- 物料用量。
- 配方单位。
- 制作顺序。
- 配方校验。
- 配方导入/导出。
- 配方下发详情。
- 同步成功/失败状态。

对 RoboOps 的参考：

- RoboOps 不能只管理“商品”，还要管理“商品/服务的履约定义”。
- 如果第一场景是饮品，配方是核心；如果未来扩展到零售、服务、实验室自动化，则配方应抽象为“流程模板/执行步骤/资源消耗”。
- 需要保留“按区域/点位/设备适用”的配置能力，否则规模化部署会被定制拖垮。

### 3.6 物料、料仓、库存与效期

相关页面：

- `MaterialManagement`
- `MaterialCate`
- `MaterialUnit`
- `MaterialAccuracy`
- `LifeSolution`
- `LifeTemplate`
- `LifeShop`
- `LifeDetail`
- `StorageReport`

相关接口：

- `material/add`
- `material/update`
- `material/delete`
- `material/list`
- `material/import`
- `material/export`
- `material/push`
- `material/status/change`
- `material/set`
- `material/clean_label`
- `material_unit/add`
- `material_unit/edit`
- `material_unit/delete`
- `material_unit/list`
- `machine_material_precision/add`
- `machine_material_precision/update`
- `machine_material_precision/delete`
- `machine_material_precision/list`
- `machine_material_precision/push`
- `machine_storage/add`
- `machine_storage/update`
- `machine_storage/delete`
- `machine_storage/list`
- `machine_storage/bind`
- `machine_storage/unbind`
- `machine_storage/push`
- `machine_storage_material/input`
- `machine_storage_material/output`
- `machine_storage_material/set_capacity`
- `machine_storage_material/lack_warn_weight`
- `machine_storage_material/supply_warn_weight`
- `material_supply_log/page`
- `machine_storage_adjust/page`
- `machine_storage_adjust/export`
- `validity_plan/add`
- `validity_plan/update`
- `validity_plan/delete`
- `validity_plan/list`
- `validity_plan/shop/bind`
- `validity_plan/shop/unbind`
- `validity_plan/shop/list`
- `validity_plan/material/bind`
- `validity_plan/material/unbind`
- `validity_plan/material/list`
- `validity_plan/material/update`
- `validity_plan/material/push`
- `material_batch/list`
- `material_batch/loss`
- `material_batch/batch_loss`
- `material_batch/loss_log`
- `material_batch/print_log`

核心字段/功能：

- 物料编码/名称。
- 物料分类。
- 物料单位。
- 克、毫升、分钟等单位。
- 物料类型。
- 储存类型：常温、冷藏、冷冻、热保存。
- 有效期。
- 到期提醒。
- 提前预警。
- 密度。
- 物料精度设置。
- 校准用量。
- 允许误差类型/误差值。
- 下发物料到设备。
- 下发物料精度到设备。
- 料仓容量。
- 满管值。
- 超时排出量。
- 电机转速。
- 当前重量。
- 缺料预警重量。
- 补料预警重量。
- 效期方案。
- 关联门店/关联物料。
- 报损录入、批量报损、拍照报损。
- 打印记录。

对 RoboOps 的参考：

- 饮品场景必须重视物料、料仓、效期、补料、报损。
- 如果 RoboOps 做通用化，物料可抽象为“资源/耗材/库存单元”，适配饮品原料、零售库存、服务耗材、实验室试剂。
- 第一版不一定做完整库存，但至少应在订单异常、设备异常和运营任务中保留“补料/耗材不足/过期/报损”这些扩展点。

### 3.7 清洗与维护

相关页面：

- `CleanPlanManagement`
- `CleanPlanLog`
- `CleanRecord`

相关接口：

- `cleanplan/add`
- `cleanplan/update`
- `cleanplan/delete`
- `cleanplan/list`
- `cleanplan/get`
- `cleanplan/enable`
- `cleanplan/disable`
- `cleanplan/machine/select`
- `cleanplan/machine`
- `cleanplan/bind`
- `cleanplan/unbind`
- `cleanplan/bind_and_push`
- `cleanplan/push`
- `clean_plan_pub_log/list`
- `clean_plan_pub_log/detail`
- `machine/clean_log`
- `machine/clean_log/export`

核心字段/功能：

- 清洗方案名称。
- 清洗方案类型。
- 适用硬件。
- 设备品牌/型号。
- 清洗方式。
- 单管/双管。
- 清洗步骤，最多 15 步。
- 清洗模式。
- 是否再次确认。
- 清洗提示内容。
- 方案状态。
- 启用/停用。
- 关联设备。
- 下发到设备。
- 发布记录。
- 发布状态：发布中、发布成功、超时失败、已删除。
- 清洗开始/结束时间。
- 清洗总时长。
- 清洗记录导出。

对 RoboOps 的参考：

- 机器人商业运营一定会有维护 SOP，不只是故障维修。
- 第一版可以不做复杂清洗方案，但需要有“维护任务/巡检/清洁/补料/重启/人工接管”等统一任务模型。
- 对设备配置或维护策略的“下发 + 发布状态 + 日志”机制值得参考。

### 3.8 软件包与升级策略

相关页面：

- `Software`
- `Sof`
- `UpgradeStrategy`
- `ModalPublish`
- `ModalPubLog`

相关接口：

- `software_package/add`
- `software_package/delete`
- `software_package/list`
- `software_package/approved`
- `software_package/publish`
- `software_package/upgrade`
- `software_package/upgrade/list`
- `software_package/machine/list`

核心字段/功能：

- 软件包类型：应用、固件、H5 应用。
- 软件包名。
- 版本号/版本名。
- 状态：审核中、灰度中、已全量。
- 硬件名称。
- 上传软件包。
- 审核通过。
- 全量发布。
- 取消全量发布。
- 强制升级/可选升级。
- 升级策略。
- 升级范围：区域、门店、设备。
- 软件包选择。
- 升级记录。

对 RoboOps 的参考：

- 如果 RoboOps 要接管真实点位，版本管理迟早会成为基础设施。
- 第一版至少需要能展示设备端 App/固件/机器人软件版本，后续再做灰度发布、强制升级、升级策略。
- 人形机器人场景中，软件包可能还包括机器人行为包、任务脚本、模型版本、技能包，需要预留扩展。

### 3.9 报表中心

相关页面：

- `ProductSaleReport`
- `CateSaleReport`
- `ShopSaleReport`
- `ShopProductSaleReport`
- `ProductionReport`
- `MaterialReport`
- `ShopMaterialReport`
- `StorageReport`
- `calibrationReport`

相关接口：

- `databi/product_sale`
- `databi/product_sale/export`
- `databi/category_sale`
- `databi/category_sale/export`
- `databi/shop_sale`
- `databi/shop_sale/export`
- `databi/shop_product_sale`
- `databi/shop_product_sale/export`
- `databi/production`
- `databi/production/export`
- `databi/material_usage`
- `databi/material_usage/export`
- `databi/shop_material_usage`
- `databi/shop_material_usage/export`
- `databi/storage_usage`
- `databi/storage_usage/export`
- `databi/makeTeaDetails`
- `databi/makeTeaDetails/export`

报表维度：

- 商品/饮品销量。
- 分类销量。
- 门店销售。
- 门店商品销售。
- 生产统计。
- 物料消耗。
- 门店物料消耗。
- 库存/料仓使用。
- 制作明细。
- 标定报表。

典型指标：

- 下单数量。
- 待制作。
- 异常数。
- 未匹配配方。
- 已制作。
- 含已制作退单。
- 已退单。
- 商品种类数。
- 下单门店数。
- 应出量。
- 实出量。
- 出茶耗时。
- 出茶状态。
- 异常原因。
- 使用时长。
- 总流量。
- 关联物料。
- 总补料数量。
- 总出料量。
- 总损耗量。
- 损耗率。

对 RoboOps 的参考：

- RoboOps 第一版至少要有运营日报维度：订单、收入、异常、点位、设备在线、退款、履约完成率。
- 后续应扩展到“机器人任务效率”“异常原因分布”“人工介入次数”“点位复制效率”等机器人特有指标。
- 报表要支持导出，因为真实客户运营和财务会大量依赖 Excel。

### 3.10 权限、用户、角色与组织

相关页面：

- `User`
- `Role`
- `Permission`
- `StructureManagement`

相关接口：

- `user/add`
- `user/delete`
- `user/list`
- `user/page`
- `user/update/info`
- `user/update/password`
- `role/add`
- `role/update`
- `role/delete`
- `role/page`
- `menu/tree`
- `menu/list`
- `menu/save_role_menu`
- `organize/list`
- `organize/listadd`

核心字段/功能：

- 用户账号。
- 用户名称/昵称。
- 密码/修改密码。
- 角色。
- 状态。
- 门店权限。
- 不填表示拥有全部门店权限。
- 角色名称。
- 角色状态。
- 是否管理员。
- 编辑权限。
- 菜单权限树。
- 组织层级。
- 组织编码/名称。

对 RoboOps 的参考：

- RoboOps 必须尽早做角色权限，不然客户方老板、运营、客服、运维、财务、工程支持会混在一起。
- 权限不只是菜单权限，还包括数据范围：客户、区域、点位、设备、订单。
- “门店权限”在 RoboOps 中应抽象成“点位权限/场景权限”。

### 3.11 日志、任务与通知

相关页面/接口：

- `OperationLog`
- `DataLog`
- `TrackerLog`
- `async_task/list`
- `async_task/get`
- `async_task/mark_read`
- `async_task/clear`
- `operation_log/list`
- `data_log/list`
- `machine_log/list`

系统配置中还包含通知机器人：

- 企业微信机器人。
- 钉钉机器人。
- 飞书机器人。
- 默认通知机器人。
- 业务通知、预警信息可通过机器人及时通知到人。

对 RoboOps 的参考：

- 后台操作必须留痕，尤其是退款、重启、下发配置、人工接管、关闭异常。
- 异步任务适合处理导入、导出、批量下发、批量升级。
- 通知能力应成为异常中心和运维任务中心的基础能力。

## 4. TeaPilot 的核心产品模式

从功能结构看，TeaPilot 是围绕“自动制饮设备商业运营”的系统，主线可以概括为：

1. 建组织/区域/门店。
2. 绑定设备。
3. 配置饮品、规格、物料、配方。
4. 把配方、物料、清洗方案、设备模板下发到设备。
5. 接收订单并下发制作。
6. 记录制作、出料、扫码、取货、异常、退单等状态。
7. 通过报表看销售、生产、物料、损耗。
8. 通过清洗、效期、料仓、升级、日志支撑长期运营。

这条主线与 RoboOps 的关系：

- TeaPilot 的场景是茶饮设备。
- RoboOps 的场景应是机器人商业运营。
- 可以借鉴“运营对象和流程闭环”，但不能把饮品/茶饮字段写死。

## 5. 对 RoboOps 的可借鉴能力

### 5.1 第一版值得借鉴

- 总览工作台。
- 点位/门店管理。
- 设备/机器人管理。
- 订单中心。
- 订单详情里的履约过程记录。
- 异常订单筛选。
- 手工创建/补发/下发订单。
- 商品/服务配置。
- 基础物料/资源配置。
- 角色、用户、点位权限。
- 操作日志。
- 基础报表导出。

### 5.2 第二阶段值得借鉴

- 配方/流程模板管理。
- 配置下发和下发状态追踪。
- 设备模板。
- 维护/清洗/巡检任务。
- 物料效期、补料、报损。
- 软件包和升级策略。
- 异步任务中心。
- 企业微信/钉钉/飞书通知。

### 5.3 需要为 RoboOps 强化的能力

TeaPilot 目前从前端看更偏“设备 + 饮品制作”。RoboOps 需要额外强化：

- 机器人任务状态。
- 机器人接单/执行/交互/感知异常。
- 人工接管流程。
- 多机器人/多设备协同。
- 顾客是否取走/是否完成交付的判定闭环。
- 异常分级、分派、SOP、超时。
- 客服/退款/补偿闭环。
- 多场景模板，而不是只围绕饮品配方。
- 机器人公司客户的运营岗位分工方案。

## 6. 不建议照抄的地方

- 不建议直接使用“门店、饮品、配方、出茶、料仓”等强茶饮语义作为 RoboOps 的底层命名。
- 不建议第一版就照搬完整物料、效期、清洗、升级、报表系统，容易压垮 MVP。
- 不建议把所有设备运维动作都做成后台按钮，机器人场景需要更严格的权限、确认和审计。
- 不建议只做页面和列表，真正价值在于订单、任务、异常、设备、人员之间的业务闭环。

## 7. RoboOps 建议抽象模型

TeaPilot 字段可以抽象为 RoboOps 的通用对象：

- 门店 -> 点位/场景单元。
- 设备 -> 机器人/自动化设备/外围设备。
- 饮品/商品 -> 商品/服务。
- 配方 -> 履约流程/执行模板/资源消耗规则。
- 出茶/出料 -> 执行动作/产出记录。
- 清洗方案 -> 维护 SOP/运维任务模板。
- 料仓/物料 -> 资源/耗材/库存单元。
- 下发 -> 配置发布/任务派发/远程指令。
- 制作异常 -> 履约异常/机器人异常/设备异常。
- 门店权限 -> 点位权限/数据范围。

## 8. 对当前 RoboOps PRD 的直接影响

建议在后续 PRD 中新增或强化以下章节：

1. 点位模型：不只包含地址和状态，还要包含业务类型、绑定机器人/设备、营业设置、数据权限。
2. 订单履约模型：订单状态之外，要记录履约步骤、执行设备、执行日志、异常原因。
3. 配置下发模型：商品/服务、流程、设备配置、维护方案需要有下发状态。
4. 异常中心：TeaPilot 有订单异常和生产异常，但 RoboOps 应升级为独立异常/工单中心。
5. 资源模型：先轻量定义物料/耗材/库存扩展点，饮品场景需要时再展开。
6. 权限模型：不只定义平台管理员、客户管理员、运营、运维、客服、财务、只读角色，还应进一步抽象为角色模板、权限包、数据范围、审批策略和异常默认负责人，详见 `05-组织角色与权限模型.md`。
7. 报表模型：MVP 先做订单、点位、设备、异常、退款、营收；后续再做物料和生产效率。

## 9. 后续需要补充

以下内容属于 TeaPilot 参考系统的事实验证，不是 RoboOps 产品定义的前置条件。能补齐会让竞品参考更完整，但 RoboOps 的核心框架应继续按通话判断和自身规划推进。

需要人工或用户协助补齐：

- 验证码登录后的真实菜单截图。
- 测试账号实际可见权限范围。
- 首页真实看板截图。
- 订单详情真实字段。
- 设备详情真实状态。
- 异常订单真实处理路径。
- 是否存在退款/财务结算模块。
- 是否存在客服处理入口。
- 是否存在移动端/小程序端配套。

## 10. 当前结论

TeaPilot 说明，同类设备运营后台的基础功能已经不止是“设备在线 + 订单列表”。成熟一些的系统会围绕真实经营闭环，把门店、设备、商品、配方、物料、订单、维护、版本、报表、权限、日志、通知放到同一套后台里。

RoboOps 可以借鉴它的“运营闭环完整性”，但必须把饮品设备语义抽象掉，转成面向机器人商业场景的通用产品：

> 点位可管理，机器人可观测，订单可履约，异常可闭环，配置可下发，运营可分工，数据可复盘。
