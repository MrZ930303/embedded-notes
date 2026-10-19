阶段03 · 单元13 · 本地候选

# ADC条件、码值与有限调用速查 {#adc-sampling-reference}

## ADC速查的条件入口 {#adc-ref-overview-title}

<div id="adc-ref-overview"></div>

<p>用于采集终端复查名义计划、码值与有限host调用。前置单元09–11；本地候选，不表示发布、个人掌握或硬件验证。完整因果、短预测和十题见<a href="./adc-sampling.html">正文</a>。普通打印完整内容：正常结束或打印调度失败都会恢复此前折叠状态与临时模式。无JS时先手动展开需要的折叠再打印。</p>

## 参考与时钟速查 {#adc-ref-clock-title}

<div id="adc-ref-clock"></div>

<p>F407VG/LQFP100、独立regular ADC；假设未验证wired VDDA=VREF+=3.3V。LQFP100有外部VREF+，不能把小封装内部连接当全族规则。PCLK2=84MHz；÷2/4/6/8→42/21/14/10.5MHz，无TIM倍频。选定VDDA2.4–3.6V上限36MHz，42拒绝、21接受；1.8–2.4V带上限18MHz。</p><p>位数6/8/10/12；sample3/15/28/56/84/112/144/480。12位+sample15→27/21MHz≈1.285714µs，采样窗口≈0.714286µs；启动/触发/调度/模拟建立另计，不能推出实测采样率。</p>

## 4096/4095与有理重建 {#adc-ref-bins-title}

<div id="adc-ref-bins"></div>

<p>以下可执行数值使用原创floor-bin教学模型，明确区别于真实F407被测/保证的传输曲线，也区别于AN5537的理想最近电平约定。令L=2^N，maxcode=L−1；12位有4096个区间，最大码4095。整数参考r∈1..3600000µV，输入x∈0..r；先验证再计算code=min(L−1,floor(x×L/r))。恰在阈值时归入上一区间，输入等于参考时饱和到4095。</p><p>q=r/L是区间宽度，不是r/(L−1)。r=3300000µV时q=3300000/4096µV=0.8056640625mV。1649999µV略低于2048q=1650000µV，所以码2047；1650000µV恰等于阈值所以2048；3300000µV先得到4096，再饱和到4095。0µV给0。阈值判断使用整数/有理数，显示小数不参与选bin。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="4096是区间数量，4095是顶码，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="adc-bin-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">N12 → L4096；q=3300000/4096µV</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">1649999µV → 2047；1650000µV → 2048（阈值归上格）</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">3300000µV → 原始4096 → 饱和4095，不新增第4097格</text></svg></div><figcaption id="adc-bin-caption">4096是区间数量，4095是顶码。原创图；箭头是有条件的因果或状态关系，结论也在正文完整说明。</figcaption></figure><p>最大中间乘积3600000×4096=14745600000，超过uint32_t的4294967295。C先把操作数扩到uint64_t再乘，若先在32位乘再赋64位已经来不及。合法域已证明远低于uint64上限；无需制造不可能的64位溢出分支。JS这里所有中间整数低于2^53，精确判定没有使用浮点容差来改写边界。空、负数、非整数、非有限数及超范围输入先拒绝，旧接受行保留标签。</p><p>活动核对四个固定输入0/1649999/1650000/3300000；预测选择码所在区域，反馈同时列出精确分数。重置清空尚未赢得的结果。</p><p>同一码有两种明确命名的重建：下边缘估计Vlow=code×r/L；端点插值Vend=code×r/(L−1)。前者返回该floor区间左边界，后者把码0和最大码分别映到0和r。端点插值不会把实际量化步距改成r/4095，也不能证明增益已校准。输入code必须0..L−1，先检查再除。</p><p>12位/r3.3V：code2048下边缘=6758400000/4096µV=1.65V；端点插值=6758400000/4095µV≈1.650402930V。code4095下边缘=13513500000/4096µV=3.2991943359375V；端点插值=3.3V。它们是不同估计约定，并无“两个ADC互相矛盾”。</p><p>普通未饱和floor区间有0≤x−Vlow&lt;q，误差单边；本模型包含x=r的顶端饱和点，在那里x−Vlow=q，不能仍写严格小于q。最近电平/中心估计可产生±½LSB一类结论，但必须限定其传输、舍入及端点削顶范围。资料中理想最近电平第一转折0.5LSB的叙述不替换本页floor阈值。</p>

## 误差、建立与混叠速查 {#adc-ref-errors-title}

<div id="adc-ref-errors"></div>

<p>把误差分开才知道该查哪里：参考电压偏差改变比例尺；参考噪声/漂移随时间改变比例；偏移把曲线平移；增益改变跨度；随机噪声让相同输入代码散布；DNL描述单码宽偏离1LSB，INL描述相对所选端点关联直线的偏离。TUE是综合静态转移偏差指标，不能再把其组成项全部相加一次。规格表的测试条件、典型/最大值与温度/电压条件不可丢。</p><p>例：实际参考3.0V、实际输入1.5V，在本floor模型仍得到半量程2048；若软件错用3.3V作下边缘重建，得到1.65V，比例高10%，误差+0.15V。这是参考尺度错误，不会靠多取几次平均自动消失。真实3.0V是否稳定、接线与工作条件仍需单独验证。</p><p>若各项已给出兼容基准的绝对界且互不重计，可以保守相加；最坏界相加本身不要求统计独立，也不能重计TUE。RSS（方和根）则需要已证明的统计模型与独立性，不能凭项名臆造。平均可能降低特定零均值非相关随机噪声；固定偏移、参考系统偏差、未建立输入与已混叠分量并不会普遍被平均消除。量化噪声也可能与输入/采样时钟相关，AN5537的理想噪声推导不是本板ENOB保证。</p><p>来源冲突必须保留：AN2834 Rev10 §3.1.2的最后转折正文写VREF−0.5LSB，邻图标4094.5LSB，所举3.3V数值又对应4095.5LSB。三者不一致；不把那组最后转折数字当成F407阈值保证。该文§3.2.7把(RAIN+RADC)CADC称为充电时间时，也不能把一个时间常数直接等同十二位建立时间。当前表格/公式像素尚未核验。</p><p>采样开关闭合后，源阻抗、内部开关与电容形成有限充电过程；窗口结束太早，代码会忠实反映尚未到达目标的电压。高源阻抗、多路切换、源/PCB电容与驱动能力都会改变建立。DS8626 Table67的CADC=4pF是典型值，不能作保证最大值；RAIN的50kΩ与Equation1条件绑定，Table68的精度又限定fADC30MHz/PCLK2 60MHz/RAIN&lt;10kΩ。没有公式几何与板级核查，不能发布一个真实数值RAIN设计上限。</p><p>原创虚构算例：R=1kΩ、C=10nF，已知全跨度阶跃、理想单极点，τ=RC=10µs。残差为ΔV·exp(−t/τ)。12位半LSB目标是ΔV/8192，所以exp(−t/τ)≤1/8192；取对数得t≥ln8192·τ=13ln2×10µs≈90.1091µs。一个τ只剩约36.8%残差，远大于半LSB目标。此虚构网络不是F407真实输入网络。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="时间常数不等于十二位建立时间，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="adc-settle-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">虚构R1kΩ × C10nF → τ10µs；全跨度一步跳变</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">残差/跨度 = exp(-t/τ)；目标 ≤ 1/8192</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">t ≥ ln8192 × 10µs ≈ 90.1091µs；不能套典型4pF</text></svg></div><figcaption id="adc-settle-caption">时间常数不等于十二位建立时间。原创图；箭头是有条件的因果或状态关系，结论也在正文完整说明。</figcaption></figure><p>活动仅检验这个虚构模型：t=10µs不够，t=91µs达到所声明残差目标；它不批准真实ADC的sample设置。修改输入会清除预测，并把旧接受结果标成旧行。</p><p>先声明理想基带、均匀采样与带宽受限的前提：fs=1000Hz，600Hz正弦的样本sin(2π·600n/1000)=−sin(2π·400n/1000)，即相位调整的400Hz正弦。n=0..4时约0、−0.587785、+0.951057、−0.951057、+0.587785。它与真实400Hz反相分量给出完全相同的离散序列；单看采样结果无法知道原来是哪一个。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="采样前限制带宽，采样后无法拆开相同序列，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="adc-alias-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">均匀fs1000Hz：600Hz正弦与反相400Hz样本相同</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">模拟输入 → 前置抗混叠滤波 → 采样；需实际过渡带与衰减</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">已折叠到400Hz后，数字滤波无法辨认是哪种原始频率</text></svg></div><figcaption id="adc-alias-caption">采样前限制带宽，采样后无法拆开相同序列。原创图；箭头是有条件的因果或状态关系，结论也在正文完整说明。</figcaption></figure><p>因此要在采样前用模拟滤波限制会折入带内的成分，并按允许带宽、过渡带与衰减设计；不能只说“fs大于2倍”就忽略实际滤波器。这里仅讲基带采集，不能推广为所有带通采样都不合法。界面每秒服务1000次、请求1000次或动画很平滑，都没有证明触发、孔径与实际采样时刻均匀，更没有测得1kHz acquisition rate。</p>

## 调用与资源速查 {#adc-ref-lifecycle-title}

<div id="adc-ref-lifecycle"></div>

<p>公共C没有等待EOC的循环。adc_start先验证完整AdcRequest并按值复制；之后调用者修改request不影响已经接收的操作。active时新start返回BUSY，优先于检查替换请求。一次adc_poll最多服务一个旧phase：ACQUIRE取得机会→CONVERT计算候选→RESULT提交。WAIT立即PENDING而不推进；FAIL返回BACKEND_ERROR，始终保留此前committed/hasSample。只有本次返回READY且samplePresent=true才授权消费新值。</p><p>固定成功：start0；poll0 ADVANCE服务ACQUIRE，next CONVERT；poll1服务CONVERT，candidate2048、next RESULT，旧committed仍未改；poll2服务RESULT，提交2048并active=false。0/1/2是合作式主机毫秒replay，不是27/21MHz的物理转换过程。也允许同一合法tick连续三次调用各走一步；这说明接口的工作上界，不意味着硬件零时延。</p><p>期限从本次start观察开始计20ms，等号过期且先于新事件。start100、poll119仍可PENDING；poll120即使提供ADVANCE，也先TIMEOUT，不提交候选。借入实际time_elapsed，使用模32减法与真实观察间隔&lt;2^31tick承诺；4294967290→4为10ms，观察差≥2147483648先拒绝并保持所有命名state/report。相同tick合法但不增长age；两个样本无法侦测未观察整圈。存储age只在0..19或超时饱和20，避免累积溢出。没有推进时钟或调度服务，有限数值本身不保证墙钟终止。</p><p>READY/error/timeout同步释放这个纯值host操作。adc_cancel只对active有效：常量动作清candidate、active=false、terminal/CANCELLED，保留已提交样本，返回samplePresent=false。它是本地fake同步cleanup确认，不是异步取消接受、真实物理abort、代次令牌或远端副作用撤回。IDLE或已终态cancel返回BAD_STATE且保持report；终态poll也BAD_STATE，所以调用者不能仅看一个旧report.samplePresent便消费。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="候选与已提交样本是两个对象，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="adc-fake-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">0 / ACQUIRE → PENDING；1 / CONVERT → candidate2048，旧样本保持</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">2 / RESULT → READY + samplePresent，才提交2048</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">age≥20先TIMEOUT；FAIL/cancel都保留旧committed，不冒充新值</text></svg></div><figcaption id="adc-fake-caption">候选与已提交样本是两个对象。原创图；箭头是有条件的因果或状态关系，结论也在正文完整说明。</figcaption></figure><p>浏览器固定replay每个场景最多3步，不扩张历史。先跑成功，再改场景为期限或backend错误：旧2048保留而本次没有新样本。场景编辑是待应用；首次执行新场景时拷贝参数，之后只推进该场景。重置清空接受行及先前样本。</p><p>资源与生命周期：一个五uint32请求（字段共20字节）、一个uint16候选、一个uint16已提交码、两个uint32时间字段、phase/status及两个bool；总sizeof受ABI填充/枚举宽度影响，应由本地编译查看。生产函数无循环、事件队列、heap、回调、递归、sleep或阻塞I/O；一次poll至多一个阶段，报告不留历史。浏览器场景最多3步，终点禁继续；这不是目标CPU执行周期上界。</p><p>adc_init只用于真正fresh storage，不读取旧字段，也不授权覆盖一个仍live的操作。其他调用要求真实存活、正确类型且已初始化的对象，独占单上下文不可重入；所有输出可写且与本调用其他对象不重叠。空指针/命名元数据检查不能识别伪造或悬空地址、虚假容量、任意内存损坏。无效调用保持全部命名字段；合法期限/错误/取消只改变文档化操作字段，旧committed/hasSample不变。所有运行检查保留在NDEBUG。</p><p>原生检查通过已有mcu-build custom profile的validate→dry-run→build执行，严格C11 normal/NDEBUG、独立模块和实际重复头调用者分别编译/链接。源码/头/工具/profile/log/rawstatus/新鲜产物哈希留作任务证据；失败不运行旧文件。栈启发式、人工常量资源检查与主机.su仅是当前编译条件的局部信息，未证明目标/完整程序最大栈。</p>

## 全部可下载C与依赖 {#adc-ref-c-title}

<div id="adc-ref-c"></div>

<p>资源与生命周期：一个五uint32请求（字段共20字节）、一个uint16候选、一个uint16已提交码、两个uint32时间字段、phase/status及两个bool；总sizeof受ABI填充/枚举宽度影响，应由本地编译查看。生产函数无循环、事件队列、heap、回调、递归、sleep或阻塞I/O；一次poll至多一个阶段，报告不留历史。浏览器场景最多3步，终点禁继续；这不是目标CPU执行周期上界。</p><p>adc_init只用于真正fresh storage，不读取旧字段，也不授权覆盖一个仍live的操作。其他调用要求真实存活、正确类型且已初始化的对象，独占单上下文不可重入；所有输出可写且与本调用其他对象不重叠。空指针/命名元数据检查不能识别伪造或悬空地址、虚假容量、任意内存损坏。无效调用保持全部命名字段；合法期限/错误/取消只改变文档化操作字段，旧committed/hasSample不变。所有运行检查保留在NDEBUG。</p><p>原生检查通过已有mcu-build custom profile的validate→dry-run→build执行，严格C11 normal/NDEBUG、独立模块和实际重复头调用者分别编译/链接。源码/头/工具/profile/log/rawstatus/新鲜产物哈希留作任务证据；失败不运行旧文件。栈启发式、人工常量资源检查与主机.su仅是当前编译条件的局部信息，未证明目标/完整程序最大栈。</p><h3 id="adc-source-adc-h">adc.h · 完整文本</h3><p><a href="../examples/adc-sampling/adc.h" download>下载adc.h</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.h
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite value-only host ADC transaction.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_ADC_H
#define EMBEDDED_NOTES_ADC_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define ADC_DEADLINE_MS UINT32_C(20)
#define ADC_PCLK2_HZ UINT32_C(84000000)
#define ADC_MAX_REFERENCE_UV UINT32_C(3600000)

typedef enum {
    ADC_OK = 0, ADC_PENDING, ADC_READY, ADC_BUSY, ADC_INVALID_ARGUMENT,
    ADC_BAD_STATE, ADC_TIME_REJECTED, ADC_BACKEND_ERROR, ADC_TIMEOUT, ADC_CANCELLED
} AdcStatus;

typedef enum {
    ADC_IDLE = 0, ADC_ACQUIRE, ADC_CONVERT, ADC_RESULT, ADC_TERMINAL
} AdcPhase;

typedef enum {
    ADC_EVENT_WAIT = 0, ADC_EVENT_ADVANCE, ADC_EVENT_FAIL
} AdcEvent;

typedef struct {
    uint32_t bits;
    uint32_t sampleCycles;
    uint32_t divider;
    uint32_t referenceUv;
    uint32_t inputUv;
} AdcRequest;

typedef struct {
    uint32_t adcHz;
    uint32_t totalCycles;
} AdcPlan;

typedef struct {
    uint64_t numeratorUv;
    uint32_t denominator;
} AdcRational;

typedef struct {
    AdcStatus status;
    AdcPhase phase;
    uint32_t elapsedMs;
    bool samplePresent;
    uint16_t sample;
} AdcReport;

typedef struct {
    AdcRequest request;
    AdcPhase phase;
    AdcStatus status;
    uint32_t lastObserved;
    uint32_t elapsedMs;
    uint16_t candidate;
    uint16_t committed;
    bool hasSample;
    bool active;
} AdcState;

/*
 * Value-only original host model, no MMIO/HAL/IRQ/DMA, caller buffer retention,
 * callbacks, allocation, recursion, sleep or blocking loops. Single exclusive
 * non-reentrant context. Every nonnull pointer names a real live correctly typed
 * object; outputs are writable and disjoint from every other call object.
 * Fresh init never reads old storage; all other state calls require an object
 * initialized by adc_init. Never initialize over a live operation. Named-field
 * checks cannot validate forged/dangling pointers or arbitrary corruption.
 *
 * Quantizer domain: bits 6/8/10/12; reference 1..3600000 uV; input 0..reference.
 * This arithmetic domain is not a legal hardware voltage specification.
 * Plan: fixed PCLK2=84MHz, assumed F407VG/LQFP100 wired VDDA=VREF+=3.3V,
 * selected 36MHz ADC bound; dividers 2/4/6/8, but 2 is rejected at this PCLK2.
 * Sample cycles 3/15/28/56/84/112/144/480. Total cycles = sample + bits.
 *
 * Time uses separately linked unit10 time_elapsed: 1 tick=1ms, caller promises
 * true forward inter-observation gaps <2^31 ticks. Observed delta >=2^31 rejects
 * before mutation. Equal observations are valid; unseen whole wraps undetectable.
 * Poll rejects invalid args/time before transitions, then expires age >=20 before
 * event acceptance. Age is only stored below20 or set to20 on timeout, so no
 * cumulative overflow. Advancing observations and service scheduling are required
 * for eventual timeout. Three ADVANCE polls do ACQUIRE/CONVERT/RESULT, at most one
 * phase each; WAIT immediately returns PENDING. report.phase names the serviced
 * or failed phase; state.phase is the next phase. Only READY sets samplePresent.
 * READY, backend error and timeout all synchronously release the fake operation.
 * committed/hasSample survive admission rejects, pending, failures and cancel.
 * Terminal polls reject BAD_STATE and preserve report; new start is allowed.
 *
 * adc_cancel is synchronous pure-host cleanup: active=false, candidate=0,
 * phase=TERMINAL and status=CANCELLED on return. No event or external pointer can
 * still own this fake operation. It is not asynchronous acceptance, a physical
 * ADC abort, remote-effect undo, generation protection or hardware recovery.
 * Cancel requires active state; idle/terminal cancel rejects BAD_STATE.
 */

/**
 * @brief Validate the conditional fixed-clock plan; preserve output on failure.
 * @param[in] request Real finite request.
 * @param[out] plan Disjoint writable result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan);

/**
 * @brief Quantize original floor bins with inclusive top-end saturation.
 * @param[in] request Real request; only bits/reference/input are used.
 * @param[out] code Disjoint writable code, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code);

/**
 * @brief Reconstruct a validated code as exact lower-edge or endpoint fraction.
 * @param[in] request Real request; bits/reference define the code domain.
 * @param[in] code Code strictly below 2^bits.
 * @param[in] endpoint False uses 2^bits; true uses 2^bits-1 denominator.
 * @param[out] value Disjoint writable fraction, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value);

/**
 * @brief Initialize genuinely fresh storage without reading prior fields.
 * @param[out] state Real writable fresh object; no old operation may be live.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state);

/**
 * @brief Copy a valid request; busy has precedence over request/time inspection.
 * @param[in,out] state Initialized object; committed sample is preserved.
 * @param[in] request Disjoint request; no pointer is retained after return.
 * @param[in] now Start tick, any uint32_t; starts a new observation domain.
 * @return ADC_PENDING, ADC_BUSY, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now);

/**
 * @brief Perform at most one fake phase, checking deadline before supplied event.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next checked observation.
 * @param[in] event WAIT, ADVANCE or FAIL; invalid events preserve all fields.
 * @param[out] report Disjoint result; only READY indicates a fresh sample.
 * @return PENDING/READY/BACKEND_ERROR/TIMEOUT or preserving rejection status.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report);

/**
 * @brief Synchronously cancel this pure-host active operation and release it.
 * @param[in,out] state Initialized active object; committed value survives.
 * @param[out] report Disjoint result; samplePresent is false.
 * @return ADC_CANCELLED or preserving INVALID_ARGUMENT/BAD_STATE rejection.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report);

#endif
```

<h3 id="adc-source-adc-c">adc.c · 完整文本</h3><p><a href="../examples/adc-sampling/adc.c" download>下载adc.c</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.c
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite host conversion, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "adc.h"
#include "time.h"
#include <stddef.h>

/**
 * @brief Validate the quantizer's finite arithmetic domain before shifting.
 * @param[in] request Real request.
 * @return True for supported bits and reference/input values.
 */
static bool valid_values(const AdcRequest *request)
{
    /** A small arithmetic voltage is not a hardware reference qualification. **/
    return request != NULL &&
        (request->bits == 6U || request->bits == 8U || request->bits == 10U || request->bits == 12U) &&
        request->referenceUv > 0U && request->referenceUv <= ADC_MAX_REFERENCE_UV &&
        request->inputUv <= request->referenceUv;
}

/**
 * @brief Quantize exact floor bins with top-end clipping.
 * @param[in] request Finite values.
 * @param[out] code Disjoint preserved-on-rejection result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code)
{
    uint32_t levels;
    uint64_t raw;

    /** Maximum product is 14745600000, so widen before multiplying. **/
    if (!valid_values(request) || code == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    raw = (uint64_t)request->inputUv * levels / request->referenceUv;
    if (raw >= levels) {
        raw = levels - 1U;
    }
    *code = (uint16_t)raw;
    return ADC_OK;
}

/**
 * @brief Validate supported fixed-clock timing and arithmetic request values.
 * @param[in] request Real request.
 * @param[out] plan Disjoint writable output.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan)
{
    uint32_t cycles;
    uint32_t divider;

    /** Divisor two is supported by hardware but exceeds this selected bound. **/
    if (!valid_values(request) || plan == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    cycles = request->sampleCycles;
    divider = request->divider;
    if ((divider != 2U && divider != 4U && divider != 6U && divider != 8U) ||
        (cycles != 3U && cycles != 15U && cycles != 28U && cycles != 56U && cycles != 84U &&
        cycles != 112U && cycles != 144U && cycles != 480U)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (ADC_PCLK2_HZ / divider > UINT32_C(36000000)) {
        return ADC_INVALID_ARGUMENT;
    }
    plan->adcHz = ADC_PCLK2_HZ / divider;
    plan->totalCycles = cycles + request->bits;
    return ADC_OK;
}

/**
 * @brief Return an exact fraction for one named reconstruction convention.
 * @param[in] request Real request.
 * @param[in] code Validated code.
 * @param[in] endpoint Use endpoint interpolation when true.
 * @param[out] value Disjoint result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value)
{
    uint32_t levels;

    /** Input is irrelevant to reconstruction; only its declared domain is checked. **/
    if (!valid_values(request) || value == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    if (code >= levels) {
        return ADC_INVALID_ARGUMENT;
    }
    value->numeratorUv = (uint64_t)code * request->referenceUv;
    value->denominator = endpoint ? levels - 1U : levels;
    return ADC_OK;
}

/**
 * @brief Initialize every named field without reading fresh storage.
 * @param[out] state Real fresh writable object.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state)
{
    const AdcState empty = {{12U, 15U, 4U, 3300000U, 0U}, ADC_IDLE, ADC_OK, 0U, 0U, 0U, 0U, false, false};

    /** Fresh means no previous operation may still be live in this storage. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    *state = empty;
    return ADC_OK;
}

/**
 * @brief Check initialized metadata without claiming arbitrary memory validation.
 * @param[in] state Real initialized object.
 * @return True for the module's finite state invariants.
 */
static bool valid_state(const AdcState *state)
{
    AdcPlan plan;
    bool phaseActive;

    /** Public structs aid teaching; callers must not manufacture arbitrary states. **/
    if (state->phase < ADC_IDLE || state->phase > ADC_TERMINAL || state->status < ADC_OK ||
        state->status > ADC_CANCELLED || state->elapsedMs > ADC_DEADLINE_MS || state->committed > 4095U) {
        return false;
    }
    phaseActive = state->phase == ADC_ACQUIRE || state->phase == ADC_CONVERT || state->phase == ADC_RESULT;
    if (state->active != phaseActive || (state->active && state->status != ADC_PENDING)) {
        return false;
    }
    return adc_plan(&state->request, &plan) == ADC_OK &&
        state->candidate < (UINT32_C(1) << state->request.bits);
}

/**
 * @brief Admit one validated copied request without changing the committed sample.
 * @param[in,out] state Initialized object.
 * @param[in] request Request to copy.
 * @param[in] now Start tick.
 * @return ADC_PENDING or a preserving rejection.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now)
{
    AdcPlan plan;

    /** Busy precedes inspection of the proposed request, and start establishes time. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return ADC_BAD_STATE;
    }
    if (state->active) {
        return ADC_BUSY;
    }
    if (adc_plan(request, &plan) != ADC_OK) {
        return ADC_INVALID_ARGUMENT;
    }
    state->request = *request;
    state->phase = ADC_ACQUIRE;
    state->status = ADC_PENDING;
    state->lastObserved = now;
    state->elapsedMs = 0U;
    state->candidate = 0U;
    state->active = true;
    return ADC_PENDING;
}

/**
 * @brief Return a bounded terminal report and release pure-host candidate state.
 * @param[in,out] state Valid initialized operation.
 * @param[in] status Terminal category.
 * @param[in] phase Serviced or failed phase.
 * @param[out] report Disjoint writable report.
 * @return The terminal category.
 */
static AdcStatus finish(AdcState *state, AdcStatus status, AdcPhase phase, AdcReport *report)
{
    /** Only READY may replace the last committed sample. **/
    if (status == ADC_READY) {
        state->committed = state->candidate;
        state->hasSample = true;
    }
    state->candidate = 0U;
    state->active = false;
    state->phase = ADC_TERMINAL;
    state->status = status;
    report->status = status;
    report->phase = phase;
    report->elapsedMs = state->elapsedMs;
    report->samplePresent = status == ADC_READY;
    report->sample = state->committed;
    return status;
}

/**
 * @brief Advance one phase after validated time, preserving old sample until READY.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next time observation.
 * @param[in] event Supplied finite backend event.
 * @param[out] report Disjoint report, unchanged for rejected calls.
 * @return Named category, at most one phase of work.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report)
{
    uint32_t delta;
    AdcPhase phase;
    uint16_t code;

    /** Check every rejection before observing or changing the active operation. **/
    if (state == NULL || report == NULL ||
        (event != ADC_EVENT_WAIT && event != ADC_EVENT_ADVANCE && event != ADC_EVENT_FAIL)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return ADC_TIME_REJECTED;
    }
    phase = state->phase;
    state->lastObserved = now;
    if (delta >= ADC_DEADLINE_MS - state->elapsedMs) {
        state->elapsedMs = ADC_DEADLINE_MS;
        return finish(state, ADC_TIMEOUT, phase, report);
    }
    state->elapsedMs += delta;
    if (event == ADC_EVENT_FAIL) {
        return finish(state, ADC_BACKEND_ERROR, phase, report);
    }
    if (event == ADC_EVENT_ADVANCE) {
        if (phase == ADC_RESULT) {
            return finish(state, ADC_READY, phase, report);
        }
        if (phase == ADC_CONVERT) {
            if (adc_quantize(&state->request, &code) != ADC_OK) {
                return finish(state, ADC_BACKEND_ERROR, phase, report);
            }
            state->candidate = code;
        }
        state->phase = phase == ADC_ACQUIRE ? ADC_CONVERT : ADC_RESULT;
    }
    *report = (AdcReport){ADC_PENDING, phase, state->elapsedMs, false, state->committed};
    return ADC_PENDING;
}

/**
 * @brief Synchronously cancel only the active value-only host operation.
 * @param[in,out] state Real initialized active state.
 * @param[out] report Disjoint writable result.
 * @return ADC_CANCELLED, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report)
{
    /** No hardware or external buffer exists in this fake cleanup contract. **/
    if (state == NULL || report == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    return finish(state, ADC_CANCELLED, state->phase, report);
}
```

<h3 id="adc-source-time-h">time.h · 完整文本</h3><p><a href="../examples/timer-pwm/time.h" download>下载time.h</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.h
 * @author embedded-notes contributors
 * @brief Checked modulo32 observations and bounded periodic host policy.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIME_H
#define EMBEDDED_NOTES_TIME_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define TIME_MAX_PERIOD UINT32_C(2147483647)
#define TIME_HALF_RANGE UINT32_C(2147483648)

typedef enum {
    TIME_OK = 0,
    TIME_INVALID_ARGUMENT,
    TIME_BAD_STATE,
    TIME_GAP_REJECTED
} TimeStatus;

typedef struct {
    uint32_t period;
    uint32_t lastObserved;
    uint32_t remainder;
} TimeState;

typedef struct {
    bool work;
    uint32_t missed;
    uint32_t releases;
    uint32_t elapsed;
    uint32_t remainder;
} TimeReport;

/*
 * Unit fixture: one tick = one millisecond. The caller promises a true forward
 * gap < 2^31 ticks between accepted observations. Equal samples cannot reveal
 * unseen complete wraps. Rejection of observed delta >= 2^31 is not a detector
 * of every violated real-gap promise. No signed-cast time ordering is used.
 *
 * All nonnull pointers must name real, live, correctly typed objects. Output
 * objects must be writable and disjoint from all other objects in the call.
 * init may receive fresh storage; other state calls require initialized fields.
 * Nonnull checking cannot validate dangling/forged pointers or false extents.
 * Single execution context, exclusive ownership, non-reentrant. No MMIO, heap,
 * callbacks, recursion, sleeps, retry or catch-up loops. Every operation has
 * constant work/storage. Failure preserves all named state and output fields.
 */

/**
 * @brief Initialize fresh storage without reading its prior contents.
 * @param[in,out] state Real writable object; no old initialization required.
 * @param[in] period Period 1..TIME_MAX_PERIOD ticks.
 * @param[in] now Initial observation, any uint32_t value.
 * @return TIME_OK or TIME_INVALID_ARGUMENT; failure preserves named fields.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now);

/**
 * @brief Return checked modulo32 difference under the caller's true-gap promise.
 * @param[in] then Last accepted observation.
 * @param[in] now Next forward observation.
 * @param[out] elapsed Real writable uint32_t; unchanged on failure.
 * @return TIME_OK, TIME_INVALID_ARGUMENT or TIME_GAP_REJECTED.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed);

/**
 * @brief Advance phase once; report at most one work item and exact missed count.
 * @param[in,out] state Initialized period in range, remainder strictly < period.
 * @param[in] now Next observation under the true-gap promise.
 * @param[out] report Real writable object disjoint from state; no old read.
 * @return TIME_OK, TIME_INVALID_ARGUMENT, TIME_BAD_STATE or TIME_GAP_REJECTED.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report);

#endif
```

<h3 id="adc-source-time-c">time.c · 完整文本</h3><p><a href="../examples/timer-pwm/time.c" download>下载time.c</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.c
 * @author embedded-notes contributors
 * @brief Constant-work periodic release policy; host model, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "time.h"
#include <stddef.h>
#ifdef TIME_TEST
#include <stdio.h>
#endif

/**
 * @brief Initialize a periodic phase at now without reading old storage.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] period Positive period below the half range.
 * @param[in] now Initial tick sample.
 * @return Named status; failure leaves state unchanged.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now)
{
    /** Validate first; do not inspect indeterminate old contents. **/
    if (state == NULL || period == 0U || period > TIME_MAX_PERIOD) {
        return TIME_INVALID_ARGUMENT;
    }
    state->period = period;
    state->lastObserved = now;
    state->remainder = 0U;
    return TIME_OK;
}

/**
 * @brief Check the observed modulo difference, not the unseen true elapsed time.
 * @param[in] then Last accepted sample.
 * @param[in] now New forward sample under the documented real-gap promise.
 * @param[out] elapsed Writable independent output, preserved on rejection.
 * @return Named status; no side effects on failure.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed)
{
    uint32_t delta;

    /** The conversion also preserves modulo32 semantics after integer promotion. **/
    if (elapsed == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    delta = (uint32_t)(now - then);
    if (delta >= TIME_HALF_RANGE) {
        return TIME_GAP_REJECTED;
    }
    *elapsed = delta;
    return TIME_OK;
}

/**
 * @brief Cross any number of releases with a single finite arithmetic step.
 * @param[in,out] state Initialized valid state; disjoint from report.
 * @param[in] now Next tick sample under the caller's real-gap promise.
 * @param[out] report Copy-by-value result; one work item at most.
 * @return Named status; all state/report fields preserved on failure.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report)
{
    uint32_t delta;
    uint64_t total;
    TimeReport next;
    TimeStatus status;

    /** Validate every checkable premise before committing accepted phase. **/
    if (state == NULL || report == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    if (state->period == 0U || state->period > TIME_MAX_PERIOD || state->remainder >= state->period) {
        return TIME_BAD_STATE;
    }
    status = time_elapsed(state->lastObserved, now, &delta);
    if (status != TIME_OK) {
        return status;
    }
    total = (uint64_t)state->remainder + (uint64_t)delta;
    /** total <= 4294967293; releases <= 2147483647 for every valid period. **/
    next.releases = (uint32_t)(total / state->period);
    next.remainder = (uint32_t)(total % state->period);
    next.elapsed = delta;
    next.work = next.releases != 0U;
    next.missed = next.work ? next.releases - 1U : 0U;
    state->lastObserved = now;
    state->remainder = next.remainder;
    *report = next;
    return TIME_OK;
}

#ifdef TIME_TEST
/**
 * @brief Compare every named field instead of reading structure padding.
 * @param[in] left Initialized state.
 * @param[in] right Initialized state.
 * @return True exactly when all named fields agree.
 */
static bool same_state(TimeState left, TimeState right)
{
    /** Padding bytes are not part of the state preservation contract. **/
    return left.period == right.period && left.lastObserved == right.lastObserved &&
        left.remainder == right.remainder;
}

/**
 * @brief Compare all public report values without padding assumptions.
 * @param[in] left Initialized report.
 * @param[in] right Initialized report.
 * @return True when every named report field agrees.
 */
static bool same_report(TimeReport left, TimeReport right)
{
    /** This check stays active when NDEBUG is defined. **/
    return left.work == right.work && left.missed == right.missed && left.releases == right.releases &&
        left.elapsed == right.elapsed && left.remainder == right.remainder;
}

/**
 * @brief Execute literal normal/late/wrap fixtures through public calls.
 * @param[in] None.
 * @return True on all independently specified outcomes.
 */
static bool test_trace(void)
{
    TimeState state;
    TimeReport report;
    const uint32_t now[] = {109U, 110U, 145U, 145U};
    const uint32_t missed[] = {0U, 0U, 2U, 0U};
    const uint32_t remainder[] = {9U, 0U, 5U, 5U};
    const bool work[] = {false, true, true, false};
    size_t index;

    /** Expected rows come from hand-counted period boundaries 110/120/130/140. **/
    if (time_init(&state, 10U, 100U) != TIME_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (time_service(&state, now[index], &report) != TIME_OK || report.work != work[index] ||
            report.missed != missed[index] || report.remainder != remainder[index]) {
            return false;
        }
    }
    return time_init(&state, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&state, 4U, &report) == TIME_OK && report.work && report.elapsed == 10U &&
        report.releases == 1U && report.missed == 0U && report.remainder == 0U;
}

/**
 * @brief Execute bounded maximum and half-range equality cases.
 * @param[in] None.
 * @return True on all fixed boundary outcomes.
 */
static bool test_bounds(void)
{
    TimeState state;
    TimeReport report;
    uint32_t elapsed = 77U;

    /** The maximum total is 2147483646 + 2147483647, not uint32_t wrap. **/
    if (time_init(&state, TIME_MAX_PERIOD, 0U) != TIME_OK ||
        time_service(&state, UINT32_C(2147483646), &report) != TIME_OK || report.work ||
        time_service(&state, UINT32_C(4294967293), &report) != TIME_OK || !report.work ||
        report.missed != 0U || report.remainder != UINT32_C(2147483646)) {
        return false;
    }
    if (time_init(&state, 1U, 0U) != TIME_OK ||
        time_service(&state, TIME_MAX_PERIOD, &report) != TIME_OK || !report.work ||
        report.missed != UINT32_C(2147483646) || report.remainder != 0U) {
        return false;
    }
    return time_elapsed(0U, TIME_MAX_PERIOD, &elapsed) == TIME_OK && elapsed == TIME_MAX_PERIOD &&
        time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == TIME_MAX_PERIOD;
}

/**
 * @brief Exercise only initialized real objects on every checkable rejection.
 * @param[in] None.
 * @return True if failure preserves all named accepted state/report fields.
 */
static bool test_rejection(void)
{
    TimeState state = {10U, 100U, 5U};
    TimeState before = state;
    TimeReport report = {true, 17U, 18U, 19U, 20U};
    TimeReport saved = report;
    const uint32_t badPeriods[] = {0U, TIME_HALF_RANGE, UINT32_MAX};
    size_t index;

    /** Invalid initialized metadata is testable; forged pointers are not. **/
    for (index = 0U; index < 3U; index++) {
        if (time_init(&state, badPeriods[index], 0U) != TIME_INVALID_ARGUMENT || !same_state(state, before)) {
            return false;
        }
    }
    if (time_init(NULL, 10U, 0U) != TIME_INVALID_ARGUMENT ||
        time_elapsed(0U, 1U, NULL) != TIME_INVALID_ARGUMENT ||
        time_service(NULL, 0U, &report) != TIME_INVALID_ARGUMENT || !same_report(report, saved) ||
        time_service(&state, 0U, NULL) != TIME_INVALID_ARGUMENT || !same_state(state, before) ||
        time_service(&state, UINT32_C(2147483748), &report) != TIME_GAP_REJECTED ||
        !same_state(state, before) || !same_report(report, saved)) {
        return false;
    }
    state.remainder = state.period;
    before = state;
    if (time_service(&state, 110U, &report) != TIME_BAD_STATE || !same_state(state, before) ||
        !same_report(report, saved)) {
        return false;
    }
    state.period = 0U;
    before = state;
    return time_service(&state, 110U, &report) == TIME_BAD_STATE && same_state(state, before) &&
        same_report(report, saved);
}

/**
 * @brief Run active host checks and propagate output failure without assert.
 * @param[in] None.
 * @return Zero only when all checks and output complete successfully.
 */
int main(void)
{
    /** This optional main is excluded from reusable module compilation. **/
    if (!test_trace() || !test_bounds() || !test_rejection()) {
        return 1;
    }
    if (puts("PASS time: literal trace, wrap, bounds, rejection preservation") < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
```

<h3 id="adc-source-README-txt">README.txt · 完整文本</h3><p><a href="../examples/adc-sampling/README.txt" download>下载README.txt</a></p>

```text
Unit13: original floor-bin arithmetic and bounded host fake ADC

Files: adc.c, adc.h, plus the unchanged unit10 time.c and time.h.
Download all four into one directory. adc.c includes both public headers.
The implementation has no main, heap, recursion, callbacks or hardware access.
An independent C caller includes adc.h, initializes AdcState with adc_init,
starts an AdcRequest, and supplies one event/time observation per adc_poll.
Example request: {12,15,4,3300000,1650000}. Start at0; ADVANCE at0,1,2
returns PENDING,PENDING,READY with samplePresent=true and sample=2048.
These replay milliseconds are not the nominal 27/21MHz converter duration.

Save the complete block below as consumer.c in that same directory. Copy only
the lines between the markers; the marker lines are not C source. This caller
checks every return value and the fresh-result flag without relying on assert.

----- BEGIN consumer.c -----
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Minimal independent caller for the public finite host ADC interface.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "adc.h"
#include <stdio.h>

/**
 * @brief Run one copied request through the three public fake conversion phases.
 * @param[in] None.
 * @return Zero on the fixed success trace; nonzero on any failed check or output.
 */
int main(void)
{
    AdcState state;
    const AdcRequest request = {12U, 15U, 4U, 3300000U, 1650000U};
    AdcReport report = {ADC_OK, ADC_IDLE, 0U, false, 0U};

    /** All runtime checks remain active when NDEBUG is defined. **/
    if (adc_init(&state) != ADC_OK || adc_start(&state, &request, 0U) != ADC_PENDING) {
        return 1;
    }
    if (adc_poll(&state, 0U, ADC_EVENT_ADVANCE, &report) != ADC_PENDING || report.samplePresent) {
        return 2;
    }
    if (adc_poll(&state, 1U, ADC_EVENT_ADVANCE, &report) != ADC_PENDING || report.samplePresent) {
        return 3;
    }
    if (adc_poll(&state, 2U, ADC_EVENT_ADVANCE, &report) != ADC_READY ||
        !report.samplePresent || report.sample != 2048U) {
        return 4;
    }
    if (puts("PASS ADC README: PENDING PENDING READY, samplePresent=true, sample=2048") < 0 ||
        fflush(stdout) != 0) {
        return 5;
    }
    return 0;
}
----- END consumer.c -----

For a conventional local compiler, separate translation units can be built:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c adc.c -o adc.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c time.c -o time.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c consumer.c -o consumer.o
  cc adc.o time.o consumer.o -o consumer
Run ./consumer (or consumer.exe on Windows). Success returns0 and prints:
  PASS ADC README: PENDING PENDING READY, samplePresent=true, sample=2048
Repeat with -DNDEBUG on all translation units. Checks must remain active.
AgentHub execution must route every compile/preprocess/assemble/link through
mcu-build custom profiles: validate -> build --dry-run -> build. Preserve
raw status, source/header/tool/profile/log/fresh-artifact hashes. Never run
an old artifact after a failed build. No dependency installation is needed.

Repository behavioral check: node scripts/test-adc-sampling.mjs
That check executes the actual JS model/controller and print scripts.
Its --native option uses the existing compiler, Python and mcu-build router
selected by --compiler, --python and --router; see --help. The native consumer
includes each public header twice and links separately compiled adc/time.

Integer floor model, not a physical transfer guarantee:
bits6/8/10/12; reference1..3600000uV; input0..reference inclusive.
code=min(2^bits-1,floor(input*2^bits/reference)); widen before multiplying.
Maximum product14745600000 fits uint64_t and exceeds uint32_t.
adc_reconstruct returns exact numeratorUv/denominator. endpoint=false uses
2^bits (lower edge); true uses2^bits-1 (endpoint interpolation). Request
values are validated even when input does not affect the reconstruction.

adc_plan uses fixed PCLK2=84MHz and an assumed, unverified F407VG/LQFP100
wired VDDA=VREF+=3.3V with the selected36MHz bound. Dividers2/4/6/8 give
42/21/14/10.5MHz; divider2 is rejected in this fixture. Sample cycles are
3/15/28/56/84/112/144/480. Arithmetic voltage domain is not a hardware
reference-voltage approval. No register/pin/clock configuration is performed.

adc_start copies the request, retains no caller pointer, preserves committed
sample, and establishes a new time-observation domain. Busy takes precedence
over inspecting a replacement request. Other rejections preserve all named
state/output fields. adc_poll advances at most one of ACQUIRE/CONVERT/RESULT.
WAIT immediately returns PENDING. report.phase is the serviced/failed phase;
state.phase is the next phase. Only READY sets samplePresent and commits.
READY, backend error and timeout synchronously release the fake operation.
Terminal poll returns BAD_STATE and preserves report (including any old
samplePresent flag); consume output only after this call returns READY.

time_elapsed is the actual unit10 implementation:1tick=1ms, true forward
inter-observation gaps strictly below2^31 are a caller promise. Observed
delta>=2^31 rejects before mutation. Equal ticks are valid; unseen whole
wraps are undetectable. Age>=20ms expires before accepting a supplied event;
stored age saturates at20. Progressing time and service scheduling are needed
for eventual timeout. This is no measured hardware or scheduler deadline.

adc_cancel only accepts active initialized state. It synchronously clears
active/candidate, sets terminal/CANCELLED, preserves committed/hasSample and
returns samplePresent=false. IDLE/READY/error/timeout/previously-cancelled
objects reject BAD_STATE unchanged; terminal objects already released all
fake local resources. This is not asynchronous cancel acceptance, physical
abort, undo of remote effects, generation protection or real recovery.

All nonnull pointers must name real, live, correctly typed objects. Outputs
are writable/disjoint from all other objects in the call. adc_init accepts
genuinely fresh storage without reading its old fields; never initialize
over a live operation. Other calls require initialized state. Single-context,
exclusive, non-reentrant ownership. Null/metadata checks cannot validate
forged pointers, dishonest extents, aliasing violations or arbitrary memory.

Storage: one20-byte five-uint32 request, one uint16 candidate, one uint16
committed code, two uint32 time fields, phase/status and two bool flags;
ABI padding/enum widths are implementation-defined (use sizeof locally).
No retained event queue or growing history. A poll uses constant work and
no loop. Browser replay is at most3 rows, replacing one row at a time.
Host .su and the stack heuristic/manual review are qualified local evidence,
not target/whole-program maximum stack. No physical measurement, silicon
errata audit, current DS/AN table/formula pixel review or paper inspection.
```



## 实际来源边界 {#adc-ref-sources-title}

<div id="adc-ref-sources"></div>

<p>来源采用本任务已有、有限范围的实际研究记录；以下版本/条款不表示全文审计。作者读过完整研究交接和历史RM选定原文文本；历史RM页388/395/414/418/425像素由研究者实际看过，作者不把该履历改称个人重新目视。当前官方RM取得失败，未重试装饰性下载；当前DS/AN表格和公式像素、ADC硅片勘误、板上连线/参考精度、实际采样和纸张均未验证。</p><ul class="source-list"><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">ST DS8626 Rev12（March2026）</a>：Table67–68 pp135–137及封装图51–52 pp139–140已读文字，保留供电/典型值/条件限制；无当前表格公式像素证明。</li><li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">ST RM0090历史Rev5（September2013）</a>：§13.3.2、13.5、13.13.2/.4/.5/.16；不是当前官方RM核验。</li><li><a href="https://www.st.com/resource/en/application_note/cd00211314-how-to-get-the-best-adc-accuracy-in-stm32-microcontrollers-stmicroelectronics.pdf">AN2834 Rev10（October2024）</a>：§3误差/来源与§4.2.6建立；保留最后转折矛盾，不移植L5/H7设置。</li><li><a href="https://www.st.com/resource/en/application_note/an5537-how-to-use-adc-oversampling-techniques-to-improve-signaltonoise-ratio-on-stm32-mcus-stmicroelectronics.pdf">AN5537 Rev2（March2026）</a>：§2.1–2.3理想量化/基带/相关性；不据此宣称F407有硬件过采样。</li><li><a href="https://www.analog.com/media/en/training-seminars/tutorials/MT-002.pdf">Analog Devices MT-002 RevA10/08</a>：Walt Kester pp1/4–8基带混叠与前置滤波；不是STM32电气保证。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Inc/stm32f4xx_hal_adc.h">固定HAL ADC header</a>及<a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_adc.c">ADC implementation</a>：分频/采样枚举、HAL_ADC_PollForConversion与HAL_ADC_Stop。该固定版本轮询依赖HAL_GetTick，HAL_MAX_DELAY绕过期限；Stop还影响injected转换。这里原创poll并不是该阻塞HAL函数的包装或等价实现。</li></ul><p>floor阈值、RC、600/400Hz、20ms优先级与fake取消都是本教材明确选择的原创模型/政策。无MMIO/HAL驱动、校准寄存器、DMA、并发或物理恢复。本票作者检查仅证明本地源/模型/host行为；根任务另做固定HEAD完整站点及独立技术/teach双审，发布由父任务负责。</p>

<div class="next-links"><a class="btn" href="./bus-transactions.html">← 12 I2C / SPI</a><a class="btn" href="./adc-sampling.html">返回ADC正文</a><a class="btn" href="./driver-recovery.html">14 错误、超时与恢复 →</a><a class="btn" href="../learn/engineering-map.html">完整路线与待办范围</a></div>
