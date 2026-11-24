import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme.dart';
import 'requests_provider.dart';

class NewRequestSheet extends ConsumerStatefulWidget {
  const NewRequestSheet({super.key});

  @override
  ConsumerState<NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends ConsumerState<NewRequestSheet> {
  final _formKey = GlobalKey<FormState>();

  String _selectedCategory = 'time_off';
  final _titleController = TextEditingController();
  final _reasonController = TextEditingController();

  // Category specific fields
  DateTime? _startDate;
  DateTime? _endDate;
  String _leaveType = 'annual';

  final _loanAmountController = TextEditingController();
  int _repaymentMonths = 3;

  DateTime? _customClockDate;
  TimeOfDay? _customClockInTime;
  TimeOfDay? _customClockOutTime;

  final _proposedSalaryController = TextEditingController();
  DateTime? _salaryEffectiveDate;

  @override
  void initState() {
    super.initState();
    _startDate = DateTime.now().add(const Duration(days: 1));
    _endDate = DateTime.now().add(const Duration(days: 2));
    _customClockDate = DateTime.now();
    _salaryEffectiveDate = DateTime.now().add(const Duration(days: 30));
    _updateDefaultTitle();
  }

  void _updateDefaultTitle() {
    switch (_selectedCategory) {
      case 'time_off':
        _titleController.text = 'Time Off Request';
        break;
      case 'advance_loan':
        _titleController.text = 'Advance Salary Loan';
        break;
      case 'custom_clock':
        _titleController.text = 'Manual Clock Adjustment';
        break;
      case 'salary_adjustment':
        _titleController.text = 'Salary Review Request';
        break;
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _reasonController.dispose();
    _loanAmountController.dispose();
    _proposedSalaryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final details = <String, dynamic>{};

    switch (_selectedCategory) {
      case 'time_off':
        details['startDate'] =
            _startDate != null ? DateFormat('yyyy-MM-dd').format(_startDate!) : null;
        details['endDate'] =
            _endDate != null ? DateFormat('yyyy-MM-dd').format(_endDate!) : null;
        details['leaveType'] = _leaveType;
        break;

      case 'advance_loan':
        details['amount'] =
            double.tryParse(_loanAmountController.text) ?? 0.0;
        details['repaymentMonths'] = _repaymentMonths;
        break;

      case 'custom_clock':
        details['date'] = _customClockDate != null
            ? DateFormat('yyyy-MM-dd').format(_customClockDate!)
            : null;
        details['clockIn'] = _customClockInTime != null
            ? '${_customClockInTime!.hour.toString().padLeft(2, '0')}:${_customClockInTime!.minute.toString().padLeft(2, '0')}'
            : null;
        details['clockOut'] = _customClockOutTime != null
            ? '${_customClockOutTime!.hour.toString().padLeft(2, '0')}:${_customClockOutTime!.minute.toString().padLeft(2, '0')}'
            : null;
        break;

      case 'salary_adjustment':
        details['proposedSalary'] =
            double.tryParse(_proposedSalaryController.text) ?? 0.0;
        details['effectiveDate'] = _salaryEffectiveDate != null
            ? DateFormat('yyyy-MM-dd').format(_salaryEffectiveDate!)
            : null;
        break;
    }

    final success = await ref.read(requestsProvider.notifier).createRequest(
          category: _selectedCategory,
          title: _titleController.text.trim(),
          reason: _reasonController.text.trim(),
          categoryDetails: details,
        );

    if (success && mounted) {
      Navigator.of(context).pop();
      final (sucText, sucFill) = AppTheme.successPill(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Request submitted successfully for review.',
            style: GoogleFonts.plusJakartaSans(
              color: sucText,
              fontWeight: FontWeight.w700,
            ),
          ),
          backgroundColor: sucFill,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(requestsProvider);
    final isDark = AppTheme.isDark(context);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppTheme.darkCardSurface : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1A4579) : const Color(0xFFDCDFE5),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Submit Request',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textPri(context),
                        letterSpacing: -0.4,
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.close_rounded, color: AppTheme.textMut(context)),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Category Selection
                Text(
                  'Category',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textSec(context),
                  ),
                ),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  initialValue: _selectedCategory,
                  dropdownColor: isDark ? AppTheme.darkCardSurface : Colors.white,
                  decoration: const InputDecoration(),
                  items: const [
                    DropdownMenuItem(
                      value: 'time_off',
                      child: Row(
                        children: [
                          Icon(Icons.calendar_month_rounded,
                              size: 18, color: AppTheme.primaryBlue),
                          SizedBox(width: 10),
                          Text('Time Off / Leave'),
                        ],
                      ),
                    ),
                    DropdownMenuItem(
                      value: 'advance_loan',
                      child: Row(
                        children: [
                          Icon(Icons.payments_rounded,
                              size: 18, color: AppTheme.tealAccent),
                          SizedBox(width: 10),
                          Text('Advance Salary Loan'),
                        ],
                      ),
                    ),
                    DropdownMenuItem(
                      value: 'custom_clock',
                      child: Row(
                        children: [
                          Icon(Icons.schedule_rounded,
                              size: 18, color: AppTheme.goldAccent),
                          SizedBox(width: 10),
                          Text('Custom Clock Adjustment'),
                        ],
                      ),
                    ),
                    DropdownMenuItem(
                      value: 'salary_adjustment',
                      child: Row(
                        children: [
                          Icon(Icons.trending_up_rounded,
                              size: 18, color: Color(0xFF7C3AED)),
                          SizedBox(width: 10),
                          Text('Salary Review Adjustment'),
                        ],
                      ),
                    ),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _selectedCategory = val;
                        _updateDefaultTitle();
                      });
                    }
                  },
                ),
                const SizedBox(height: 16),

                // Title
                TextFormField(
                  controller: _titleController,
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.textPri(context),
                    fontSize: 14,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Request Title',
                    prefixIcon: Icon(Icons.title_rounded, size: 20),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Please enter a title' : null,
                ),
                const SizedBox(height: 16),

                // Category Specific Form Fields
                ..._buildCategorySpecificFields(context),

                const SizedBox(height: 16),

                // Reason / Explanation
                TextFormField(
                  controller: _reasonController,
                  maxLines: 3,
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.textPri(context),
                    fontSize: 14,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Reason & Justification',
                    hintText: 'Provide details for your approvers...',
                    alignLabelWithHint: true,
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Please describe your reason'
                      : null,
                ),
                const SizedBox(height: 16),

                // Optional File Attachment
                Text(
                  'Attachment (Optional)',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textSec(context),
                  ),
                ),
                const SizedBox(height: 8),

                if (state.uploadedFileName != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.border(context)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.attach_file_rounded,
                            size: 20, color: AppTheme.primaryBlue),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            state.uploadedFileName!,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textPri(context),
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.delete_outline_rounded,
                              size: 20, color: isDark ? AppTheme.darkErrorText : AppTheme.errorText),
                          onPressed: () => ref
                              .read(requestsProvider.notifier)
                              .removeAttachment(),
                        ),
                      ],
                    ),
                  )
                else
                  OutlinedButton.icon(
                    onPressed: state.isUploading
                        ? null
                        : () => ref
                            .read(requestsProvider.notifier)
                            .pickAndUploadFile(),
                    icon: state.isUploading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.upload_file_rounded, size: 18),
                    label: Text(
                      state.isUploading
                          ? 'Uploading File...'
                          : 'Upload Supporting Document (PDF / Image)',
                    ),
                  ),

                const SizedBox(height: 24),

                // Submit Button (pill shaped)
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: state.isSubmitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryBlue,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(26),
                      ),
                    ),
                    child: state.isSubmitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : Text(
                            'Submit Request',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildCategorySpecificFields(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    switch (_selectedCategory) {
      case 'time_off':
        return [
          DropdownButtonFormField<String>(
            initialValue: _leaveType,
            dropdownColor: isDark ? AppTheme.darkCardSurface : Colors.white,
            decoration: const InputDecoration(labelText: 'Leave Type'),
            items: const [
              DropdownMenuItem(value: 'annual', child: Text('Annual Leave')),
              DropdownMenuItem(value: 'sick', child: Text('Sick Leave')),
              DropdownMenuItem(
                  value: 'emergency', child: Text('Emergency Leave')),
              DropdownMenuItem(value: 'unpaid', child: Text('Unpaid Leave')),
            ],
            onChanged: (val) {
              if (val != null) setState(() => _leaveType = val);
            },
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _startDate ?? DateTime.now(),
                      firstDate: DateTime.now().subtract(const Duration(days: 30)),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _startDate = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Start Date',
                      prefixIcon: Icon(Icons.date_range_rounded, size: 20),
                    ),
                    child: Text(
                      _startDate != null
                          ? DateFormat('MMM d, yyyy').format(_startDate!)
                          : 'Select',
                      style: GoogleFonts.plusJakartaSans(fontSize: 14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _endDate ?? DateTime.now(),
                      firstDate: DateTime.now().subtract(const Duration(days: 30)),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _endDate = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'End Date',
                      prefixIcon: Icon(Icons.event_available_rounded, size: 20),
                    ),
                    child: Text(
                      _endDate != null
                          ? DateFormat('MMM d, yyyy').format(_endDate!)
                          : 'Select',
                      style: GoogleFonts.plusJakartaSans(fontSize: 14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ];

      case 'advance_loan':
        return [
          TextFormField(
            controller: _loanAmountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Requested Loan Amount (AED)',
              prefixIcon: Icon(Icons.attach_money_rounded, size: 20),
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Enter amount';
              if (double.tryParse(v) == null) return 'Enter a valid number';
              return null;
            },
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<int>(
            initialValue: _repaymentMonths,
            dropdownColor: isDark ? AppTheme.darkCardSurface : Colors.white,
            decoration: const InputDecoration(labelText: 'Repayment Period'),
            items: const [
              DropdownMenuItem(value: 1, child: Text('1 Month (Next Payroll)')),
              DropdownMenuItem(value: 2, child: Text('2 Months')),
              DropdownMenuItem(value: 3, child: Text('3 Months')),
              DropdownMenuItem(value: 6, child: Text('6 Months')),
            ],
            onChanged: (val) {
              if (val != null) setState(() => _repaymentMonths = val);
            },
          ),
        ];

      case 'custom_clock':
        return [
          InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _customClockDate ?? DateTime.now(),
                firstDate: DateTime.now().subtract(const Duration(days: 30)),
                lastDate: DateTime.now(),
              );
              if (picked != null) setState(() => _customClockDate = picked);
            },
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Target Shift Date',
                prefixIcon: Icon(Icons.today_rounded, size: 20),
              ),
              child: Text(
                _customClockDate != null
                    ? DateFormat('MMM d, yyyy').format(_customClockDate!)
                    : 'Select date',
                style: GoogleFonts.plusJakartaSans(fontSize: 14),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: const TimeOfDay(hour: 9, minute: 0),
                    );
                    if (picked != null) {
                      setState(() => _customClockInTime = picked);
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Clock-In Time',
                      prefixIcon: Icon(Icons.login_rounded, size: 20),
                    ),
                    child: Text(
                      _customClockInTime != null
                          ? _customClockInTime!.format(context)
                          : 'Select',
                      style: GoogleFonts.plusJakartaSans(fontSize: 14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: const TimeOfDay(hour: 18, minute: 0),
                    );
                    if (picked != null) {
                      setState(() => _customClockOutTime = picked);
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Clock-Out Time',
                      prefixIcon: Icon(Icons.logout_rounded, size: 20),
                    ),
                    child: Text(
                      _customClockOutTime != null
                          ? _customClockOutTime!.format(context)
                          : 'Select',
                      style: GoogleFonts.plusJakartaSans(fontSize: 14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ];

      case 'salary_adjustment':
        return [
          TextFormField(
            controller: _proposedSalaryController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Proposed Monthly Salary (AED)',
              prefixIcon: Icon(Icons.monetization_on_rounded, size: 20),
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Enter proposed salary';
              if (double.tryParse(v) == null) return 'Enter a valid number';
              return null;
            },
          ),
          const SizedBox(height: 14),
          InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _salaryEffectiveDate ?? DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (picked != null) {
                setState(() => _salaryEffectiveDate = picked);
              }
            },
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Target Effective Date',
                prefixIcon: Icon(Icons.date_range_rounded, size: 20),
              ),
              child: Text(
                _salaryEffectiveDate != null
                    ? DateFormat('MMM d, yyyy').format(_salaryEffectiveDate!)
                    : 'Select date',
                style: GoogleFonts.plusJakartaSans(fontSize: 14),
              ),
            ),
          ),
        ];

      default:
        return [];
    }
  }
}
