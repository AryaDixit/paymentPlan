import { LightningElement, api, track } from 'lwc';
import getQuoateTransferPrice from '@salesforce/apex/PaymentPlanController.getQuoateTransferPrice';
import savePaymentValues from '@salesforce/apex/PaymentPlanController.savePaymentValues';
import grossMarginCheck from '@salesforce/apex/PaymentPlanController.grossMarginCheck';
import getGpMargin from '@salesforce/apex/roiCalculator.getGpMargin';
import getVisibilityCriteria from '@salesforce/apex/GpMarginMedical.getVisibilityCriteria'

import { ShowToastEvent } from 'lightning/platformShowToastEvent';
export default class PaymentPlan extends LightningElement {
    @api recordId;
    @track totalTargetPrice = 0;
    @track gstAddOn;
    @track totalBillingPrice;
    @track principalAmount;
    @track advancedAmt;
    @track tenure;
    @track rate;
    @track monthlyInstallment = 0;
    @track netSalesValue;
    @track interest;
    @track interestGSt;
    @track totalInterest;
    @track totalPaidWithInterest;
    @track emiDates = [];
    @track data = [];
    @track showCalculator = false;
    @track grace;
    @track moratorium;
    @track errorMessage;
    columns = [
        { label: 'Sr. No', fieldName: 'srNo', type: 'number', cellAttributes: { alignment: 'left' } },
        { label: 'Date', fieldName: 'emiDate', type: 'date', typeAttributes: { month: '2-digit', day: '2-digit', year: 'numeric' } },
        { label: 'Principal Amount', fieldName: 'principalAmount', type: 'currency' },
        { label: 'Interest', fieldName: 'interest', type: 'currency' },
        { label: 'EMI', fieldName: 'emi', type: 'currency' },
        { label: 'Principal Paid', fieldName: 'principalPaid', type: 'currency' },
        { label: 'Balanced Principal', fieldName: 'balancedPrincipal', type: 'currency' }
    ];

    connectedCallback() {
        this.filtercheck();
        this.fetchtotalTargetPrice();
    }

    async filtercheck() {
        try {
            const [checkGpMargin, visibilityCriteria] = await Promise.all([
                getGpMargin({ recordId: this.recordId }),
                getVisibilityCriteria()
            ]);

            const profileName = visibilityCriteria;
            console.log('Current profile name is ', profileName);

            if (
                profileName === 'Management User Profile' ||
                profileName === 'Regional Sales Manager Profile' ||
                profileName === 'System Administrator'
            ) {
                this.showCalculator = checkGpMargin <= 15;
            } else {
                this.showCalculator = false;
            }
        } catch (error) {
            console.error('Error in filtercheck:', error);
            this.showCalculator = false;
        }
    }

    handleSave(event) {
        savePaymentValues({ recordId: this.recordId, totalBillingPrice: this.totalBillingPrice, advancedAmt: this.advancedAmt, principalAmount: this.principalAmount, rate: this.rate, tenure: this.tenure, monthlyInstallment: this.monthlyInstallment, netSalesValue: this.netSalesValue })
            .then(result => {
                console.log('Saved Succesfully!');
                const event = new ShowToastEvent({
                    title: 'Data has been saved successfully!',
                    variant: 'success'
                });
                this.dispatchEvent(event);
            })
            .catch(err => {
                console.log('ERROR Saving the values! ');
                const event = new ShowToastEvent({
                    title: 'Error saving data!',
                    variant: 'Error'
                });
                this.dispatchEvent(event);
            })
    }

    handleReset(event) {
        this.fetchtotalTargetPrice();
        this.advancedAmt = 0;
        this.principalAmount = 0;
        this.rate = 0;
        this.tenure = 0;
        this.grace = 0;
        this.moratorium = 0;
        this.netSalesValue = 0;
        this.emiDates = [];
        this.data = [];
        this.monthlyInstallment = 0;
        this.template.querySelectorAll('lightning-input').forEach(input => {
            if (['grace', 'moratorium', 'tenure'].includes(input.name)) {
                input.value = 0;
            }
        });
    }

    async fetchtotalTargetPrice() {
        try {
            this.totalTargetPrice = await getQuoateTransferPrice({ recordId: this.recordId });
            console.log('Total Target Price', this.totalTargetPrice);
            this.gstAddOn = this.totalTargetPrice * (18 / 100);
            this.totalBillingPrice = this.gstAddOn + this.totalTargetPrice;
        }
        catch (err) {
            console.log('Error fetching Transfer Price');
        }
    }

    //Commented on date 12/11/2024 (TO make the billing price non-editable)
    /*handlePriceonChangeBillingPrice(event) {
        console.log('On change method is triggered!');
        this.totalBillingPrice = event.target.value;
        this.totalTargetPrice = this.totalBillingPrice - this.gstAddOn;
        this.advancedAmt = this.totalBillingPrice - this.principalAmount;
 
    }*/

    handleAdvancedChange(event) {
        this.advancedAmt = event.target.value;
        if (this.advancedAmt < this.totalBillingPrice) {
            this.principalAmount = this.totalBillingPrice - this.advancedAmt;


            if (this.rate) {
                this.calculateNetSalesValue();
            }

            this.errorMessage = '';
        }

        else {
            this.errorMessage = 'Adv Payment cannot be greater than Total Billing Price.'
        }


    }

    handlePrincipalAmtChange(event) {
        this.principalAmount = event.target.value;
        this.advancedAmt = this.totalBillingPrice - this.principalAmount;
        if (this.rate) {
            this.populateEMIDetails();
            this.calculateNetSalesValue();
        }


    }

    handleTenureChange(event) {
        console.log('in tunure change', this.tenure)
        this.tenure = event.target.value;
        if (this.rate && this.tenure) {
            this.monthlyInstallment = this.calculatePMT(this.principalAmount, this.rate, this.tenure);
            this.populateEMIDetails();
        }
        else {
            this.monthlyInstallment = 0;
        }


    }

    handleRateChange(event) {
        this.rate = event.target.value;
        if (this.tenure) {
            this.monthlyInstallment = this.calculatePMT(this.principalAmount, this.rate, this.tenure);
        }
        this.populateEMIDetails();
        this.calculateNetSalesValue();
    }

    handleNetValueChange(event) {
        this.netSalesValue = parseFloat(event.target.value);
        this.calculatePrincipalFromNetSalesValue();
        this.populateEMIDetails();
        this.totalBillingPrice = parseInt(this.advancedAmt) + parseInt(this.principalAmount);
        this.totalTargetPrice = parseInt(this.totalBillingPrice) / 1.18;
        this.gstAddOn = this.totalTargetPrice * (18 / 100);
        console.log('totalInterest---', this.totalInterest);

    }

    //Added on date 13 January, 2025 by Arya
    handleGraceChange(event) {
        this.grace = event.target.value;
        if (event.target.value == 0) {
            this.grace = null;
        }
        this.populateEMIDetails();
    }

    handleMoratoriumChange(event) {
        this.moratorium = event.target.value;
        if (event.target.value == 0) {
            this.moratorium = null;
        }
        console.log('moratorium in the handleMoratorium', this.moratorium);
        // if (this.moratorium == 0) {
        //     this.principalAmount = this.amtBeforeMoretorium;
        // }
        //if (this.moratorium) {
        this.populateEMIDetails();
        //}

    }



    calculatePMT(principal, annualRate, tenureMonths) {
        const monthlyRate = annualRate / 12 / 100;

        console.log('Principle amount is ', principal, 'ANNUAL RATE :', annualRate, 'tenureMonths :', tenureMonths);

        const pmt = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
            (Math.pow(1 + monthlyRate, tenureMonths) - 1);

        return pmt;

    }

    getFirstDaysOfNextMonths(numMonths) {
        const currentDate = new Date();

        let currentYear = currentDate.getFullYear();
        let currentMonth = currentDate.getMonth();

        const firstDays = [];

        for (let i = 1; i <= numMonths; i++) {
            let newMonth = currentMonth + i;
            let newYear = currentYear + Math.floor(newMonth / 12);
            newMonth = newMonth % 12;

            firstDays.push(new Date(newYear, newMonth, 1));
        }

        return firstDays;
    }

    //Old Code
    // populateEMIDetails() {
    //     console.log('tenure in emi details', this.tenure);
    //     console.log('grace in emi details', this.grace);
    //     const totaldates = parseInt(this.tenure) + (this.grace ? parseInt(this.grace) : 0) + (this.moratorium ? parseInt(this.moratorium) : 0);


    //     console.log('total dates ', totaldates);
    //     this.emiDates = this.getFirstDaysOfNextMonths(totaldates);

    //     console.log('all the emi dates', JSON.stringify(this.emiDates));
    //     this.data = [];
    //     this.emiDates.forEach((date, index) => {
    //         console.log('index', index);
    //         console.log('grace', this.grace)

    //         if (index < this.grace) {
    //             let principalAmount;
    //             let principalPaid;
    //             principalAmount = this.principalAmount;

    //             this.data.push({
    //                 id: index + 1,
    //                 srNo: index + 1,
    //                 emiDate: date,
    //                 principalAmount: principalAmount,
    //                 interest: 0,
    //                 emi: 0,
    //                 principalPaid: 0,
    //                 balancedPrincipal: principalAmount
    //             });
    //         }

    //         else if (index >= this.grace && index < this.grace + this.moratorium) {
    //             let principalAmount;
    //             let principalPaid;
    //             const previousRow = this.data[index - 1];
    //             principalAmount = previousRow.balancedPrincipal;

    //             const interest = (principalAmount * (this.rate / 100)) / 12;
    //             const balancedPrincipal = principalAmount + interest;

    //             this.data.push({
    //                 id: index + 1,
    //                 srNo: index + 1,
    //                 emiDate: date,
    //                 principalAmount: principalAmount,
    //                 interest: interest,
    //                 emi: 0,
    //                 principalPaid: -interest,
    //                 balancedPrincipal: balancedPrincipal
    //             });
    //         }

    //         else {
    //             let principalAmount;
    //             let principalPaid;

    //             if (index === 0) {
    //                 principalAmount = this.principalAmount;
    //             } else {
    //                 const previousRow = this.data[index - 1];
    //                 console.log(previousRow);
    //                 principalAmount = previousRow.balancedPrincipal;
    //                 console.log(principalAmount);
    //             }

    //             const interest = (principalAmount * (this.rate / 100)) / 12;
    //             const emi = this.monthlyInstallment;
    //             principalPaid = emi - interest;

    //             const balancedPrincipal = principalAmount - principalPaid;

    //             this.data.push({
    //                 id: index + 1,
    //                 srNo: index + 1,
    //                 emiDate: date,
    //                 principalAmount: principalAmount,
    //                 interest: interest,
    //                 emi: emi,
    //                 principalPaid: principalPaid,
    //                 balancedPrincipal: balancedPrincipal > 0 ? balancedPrincipal : 0
    //             });
    //         }
    //     });

    //     console.log('EMI dates', this.emiDates);
    // }

    @track moratoriumAmount = 0;
    //New Code
    populateEMIDetails() {
        try {
            console.log('tenure in emi details', this.tenure);
            console.log('grace in emi details', this.grace);
            console.log('moratorium in emi details', this.moratorium);

            // Calculate total dates considering grace and moratorium periods
            const totaldates = parseInt(this.tenure)
                + (this.grace ? parseInt(this.grace) : 0)
                + (this.moratorium ? parseInt(this.moratorium) : 0);

            console.log('total dates', totaldates);

            // Generate all EMI dates
            this.emiDates = this.getFirstDaysOfNextMonths(totaldates);
            console.log('all the emi dates', JSON.stringify(this.emiDates));

            // Initialize data table
            this.data = [];

            let remainingPrincipal = this.principalAmount;
            let newEMI = this.monthlyInstallment;
            // Loop through EMI dates
            this.emiDates.forEach((date, index) => {
                console.log('Processing index', index);

                // Handle Grace Period
                if (index < this.grace) {
                    const principalAmount = this.principalAmount;

                    this.data.push({
                        id: index + 1,
                        srNo: index + 1,
                        emiDate: date,
                        principalAmount: principalAmount,
                        interest: 0,
                        emi: 0,
                        principalPaid: 0,
                        balancedPrincipal: principalAmount,
                    });
                }

                else if (index < this.moratorium && !this.grace) {
                    const principalAmount = this.principalAmount;
                    const interest = (principalAmount * (this.rate / 100)) / 12;
                    this.moratoriumAmount = this.moratoriumAmount + parseInt(interest);

                    const balancedPrincipal = principalAmount + interest;

                    this.data.push({
                        id: index + 1,
                        srNo: index + 1,
                        emiDate: date,
                        principalAmount: principalAmount,
                        interest: interest,
                        emi: 0,
                        principalPaid: -interest,
                        balancedPrincipal: balancedPrincipal,
                    });
                }

                // Handle Moratorium Period
                else if (index >= this.grace && index < parseInt(this.grace) + parseInt(this.moratorium) && this.grace && this.moratorium) {
                    console.log('THE INDEX IS ', index);
                    const previousRow = index > 0 ? this.data[index - 1] : this.data[index];
                    console.log('PREVIOUS ROW IS ', JSON.stringify(this.data));
                    const principalAmount = previousRow.balancedPrincipal;
                    const interest = (principalAmount * (this.rate / 100)) / 12;
                    this.moratoriumAmount = this.moratoriumAmount + parseInt(interest);

                    const balancedPrincipal = principalAmount + interest;

                    this.data.push({
                        id: index + 1,
                        srNo: index + 1,
                        emiDate: date,
                        principalAmount: principalAmount,
                        interest: interest,
                        emi: 0,
                        principalPaid: -interest,
                        balancedPrincipal: balancedPrincipal,
                    });
                }
                // Handle Post-Moratorium Period (EMI Payments)
                else {
                    console.log('in the regular emi period');
                    let principalAmount;
                    let principalPaid;
                    let i = 1;
                    //this.amtBeforeMoretorium = this.principalAmount;
                    //console.log('the amount before moretorium', this.amtBeforeMoretorium);
                    if (index === 0) {
                        principalAmount = this.principalAmount;

                    }

                    else {
                        let lastNode;
                        lastNode = this.grace && this.moratorium
                            ? parseInt(this.grace) + parseInt(this.moratorium)
                            : !this.grace && this.moratorium
                                ? this.moratorium
                                : this.grace;
                                
                        if (index == lastNode) {
                            console.log('moratorimu amount');
                            principalAmount = this.principalAmount + this.moratoriumAmount;
                            this.monthlyInstallment = this.calculatePMT(principalAmount, this.rate, this.tenure);

                        }
                        else {
                            const previousRow = this.data[index - 1];
                            console.log(previousRow);
                            principalAmount = previousRow.balancedPrincipal;
                            console.log('else condition', principalAmount);
                        }

                    }

                    const interest = (principalAmount * (this.rate / 100)) / 12;
                    const emi = this.monthlyInstallment;
                    principalPaid = emi - interest;

                    const balancedPrincipal = principalAmount - principalPaid;

                    if (i === parseInt(this.moratorium) + 1) {
                        this.monthlyInstallment = this.calculatePMT(principalAmount, this.rate, this.tenure);
                        console.log('principal amount', principalAmount);
                    }
                    i++;
                    this.data.push({
                        id: index + 1,
                        srNo: index + 1,
                        emiDate: date,
                        principalAmount: principalAmount,
                        interest: interest,
                        emi: emi,
                        principalPaid: principalPaid,
                        balancedPrincipal: balancedPrincipal > 0 ? balancedPrincipal : 0
                    });


                }
            });

            console.log('EMI dates', this.emiDates);
        }
        catch (err) {
            console.log('ERROR POPULATE EMI DETAILS ', err.toString());
        }
    }





    //doing changes here on date 11/11/2024 for NaN
    calculateNetSalesValue() {
        if (this.rate) {
            this.interest = (this.rate / 100) * this.principalAmount;
            this.interestGSt = 0.18 * this.interest;
            this.totalInterest = this.interest + this.interestGSt;
            this.totalPaidWithInterest = this.principalAmount + this.totalInterest;
            this.netSalesValue = parseFloat(this.totalPaidWithInterest) + parseFloat(this.advancedAmt);
        }
        else {
            this.interest = (1 / 100) * this.principalAmount;
            this.interestGSt = 0.18 * this.interest;
            this.totalInterest = this.interest + this.interestGSt;
            this.totalPaidWithInterest = this.principalAmount + this.totalInterest;
            this.netSalesValue = parseFloat(this.totalPaidWithInterest) + parseFloat(this.advancedAmt);

        }
    }

    calculatePrincipalFromNetSalesValue() {
        if (this.netSalesValue && this.totalInterest) {
            this.principalAmount = (this.netSalesValue - this.advancedAmt) / (1 + 0.0118 * this.rate);

        } else {
            console.log('Cannot calculate principal: Missing required values');
        }
    }

    calculateRate() {
        if (this.principalAmount > 0 && this.totalInterest) {
            // Ensure correct rate calculation based on total interest and principal amount
            const totalInterestWithGst = this.totalInterest + this.interestGSt;
            this.rate = (totalInterestWithGst / this.principalAmount) * 100;
        } else {
            console.log('Cannot calculate rate: Missing principal or interest');
        }
    }

    calculateAdvAmt() {
        console.log('Temp changes calculate Amount', this.advancedAmt);
        this.advancedAmt = parseFloat(this.netSalesValue) - parseFloat(this.totalPaidWithInterest);
    }


}