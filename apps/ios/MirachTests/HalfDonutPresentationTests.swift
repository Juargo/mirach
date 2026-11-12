import CoreGraphics
import Testing
@testable import Mirach

/// Half donut geometry (S3): angles are degrees from the top, through the leading side, 0...180.
struct HalfDonutPresentationTests {
    private func bucket(_ b: Bucket, total: Int = 1, bp: Int?, meta: Int) -> BucketResumen {
        BucketResumen(bucket: b, total: total, porcentajeBp: bp, metaBp: meta, estado: nil)
    }

    private let sample = [
        BucketResumen(bucket: .necesidades, total: 1, porcentajeBp: 5000, metaBp: 5000, estado: nil),
        BucketResumen(bucket: .deseos, total: 1, porcentajeBp: 3000, metaBp: 3000, estado: nil),
        BucketResumen(bucket: .ahorro, total: 1, porcentajeBp: 2000, metaBp: 2000, estado: nil),
    ]

    @Test func segmentsSweepTheHalfFromTheTopWithA1Point5DegreeGap() {
        let ring = HalfDonutPresentation(buckets: sample).outer

        #expect(ring.map(\.bucket) == [.necesidades, .deseos, .ahorro])
        // 50/30/20 of 180°: 90°, 54°, 36°; each side of a boundary gives up 0.75°.
        let expected: [(Double, Double)] = [(0.75, 89.25), (90.75, 143.25), (144.75, 179.25)]
        for (segment, (start, end)) in zip(ring, expected) {
            #expect(abs(segment.start - start) < 1e-9)
            #expect(abs(segment.end - end) < 1e-9)
        }
        #expect(abs(ring[1].start - ring[0].end - HalfDonutPresentation.gapDegrees) < 1e-9)
        #expect(abs(ring[2].start - ring[1].end - HalfDonutPresentation.gapDegrees) < 1e-9)
    }

    @Test func theOuterRingUsesTheShareOfTheIncomeAndLeavesTheUnspentPartEmpty() {
        // Real shares 20/10/10 of the income: 36°, 18° and 18° of the half; the other 108° stay empty.
        let buckets = [
            bucket(.necesidades, bp: 2000, meta: 5000), bucket(.deseos, bp: 1000, meta: 3000),
            bucket(.ahorro, bp: 1000, meta: 2000),
        ]
        let presentation = HalfDonutPresentation(buckets: buckets)

        #expect(abs(presentation.outer[0].start - 0.75) < 1e-9)
        #expect(abs(presentation.outer[0].end - 35.25) < 1e-9)
        #expect(abs(presentation.outer[1].end - 53.25) < 1e-9)
        #expect(abs(presentation.outer[2].end - 71.25) < 1e-9)
        // The inner ring follows the targets, independent of the month.
        #expect(abs(presentation.inner[0].end - 89.25) < 1e-9)
        #expect(abs(presentation.inner[1].end - 143.25) < 1e-9)
    }

    @Test func aMonthSpentOverItsIncomeFillsTheHalfInProportion() {
        // 60/30/30 is 120% of the income: the half is split by their sum, like 50/25/25.
        let buckets = [
            bucket(.necesidades, bp: 6000, meta: 5000), bucket(.deseos, bp: 3000, meta: 3000),
            bucket(.ahorro, bp: 3000, meta: 2000),
        ]
        let outer = HalfDonutPresentation(buckets: buckets).outer

        #expect(abs(outer[0].end - 89.25) < 1e-9)
        #expect(abs(outer[1].end - 134.25) < 1e-9)
        #expect(abs(outer[2].end - 179.25) < 1e-9)
    }

    @Test func theOuterRingIsNotDrawnWhenTheRealSharesSumToZero() {
        for bp in [Int?.none, 0] {
            let buckets = Bucket.allCases.map { bucket($0, total: 0, bp: bp, meta: 3333) }
            let presentation = HalfDonutPresentation(buckets: buckets)

            #expect(presentation.outer.isEmpty)
            #expect(presentation.inner.count == 3, "the target ring is still there")
        }
    }

    @Test func aBucketWithNoShareHasNoSegmentAndOthersFillTheHalf() {
        let buckets = [
            bucket(.necesidades, bp: 6000, meta: 5000), bucket(.deseos, bp: 4000, meta: 3000),
            bucket(.ahorro, total: 0, bp: 0, meta: 2000),
        ]
        let outer = HalfDonutPresentation(buckets: buckets).outer

        #expect(outer.map(\.bucket) == [.necesidades, .deseos])
        #expect(abs(outer[1].end - 179.25) < 1e-9)
    }

    @Test func negativeSharesCountAsZero() {
        let buckets = [
            bucket(.necesidades, bp: 5000, meta: 5000), bucket(.deseos, bp: -300, meta: 3000),
            bucket(.ahorro, bp: 5000, meta: 2000),
        ]
        #expect(HalfDonutPresentation(buckets: buckets).outer.map(\.bucket) == [.necesidades, .ahorro])
    }

    @Test func aSegmentTooThinForItsPercentageIsDrawnWithoutLabel() {
        // 800 of 9450 basis points is a 15.2° slice, 13.7° after the gap: under the 16° a label needs.
        let buckets = [
            bucket(.necesidades, bp: 5600, meta: 5000), bucket(.deseos, bp: 3050, meta: 3000),
            bucket(.ahorro, bp: 800, meta: 2000),
        ]
        let presentation = HalfDonutPresentation(buckets: buckets)

        #expect(presentation.outer.map(\.showsLabel) == [true, true, false])
        #expect(presentation.inner.map(\.showsLabel) == [true, true, true])
    }

    @Test func labelsAreTheRealPercentOutsideAndTheTargetInside() {
        let buckets = [
            bucket(.necesidades, bp: 5600, meta: 5000), bucket(.deseos, bp: 3050, meta: 3000),
            bucket(.ahorro, bp: 800, meta: 2000),
        ]
        let presentation = HalfDonutPresentation(buckets: buckets)

        #expect(presentation.outer.map(\.label) == ["56%", "31%", "8%"])
        #expect(presentation.inner.map(\.label) == ["50%", "30%", "20%"])
    }

    @Test func theMiddleOfASegmentIsHalfwayBetweenItsEnds() {
        let segment = HalfDonutPresentation(buckets: sample).outer[0]
        #expect(abs(segment.middle - 45) < 1e-9)
    }

    @Test func outerLabelsAreLightOnTheFirstTwoBucketsAndDarkOnAhorro() {
        #expect(HalfDonutPresentation.outerLabelOnBackground(.necesidades))
        #expect(HalfDonutPresentation.outerLabelOnBackground(.deseos))
        #expect(!HalfDonutPresentation.outerLabelOnBackground(.ahorro))
    }

    @Test func pointsRunFromTheTopThroughTheLeadingSideToTheBottom() {
        let center = CGPoint(x: 150, y: 150)
        let top = HalfDonutPresentation.point(degrees: 0, radius: 100, center: center)
        let left = HalfDonutPresentation.point(degrees: 90, radius: 100, center: center)
        let bottom = HalfDonutPresentation.point(degrees: 180, radius: 100, center: center)

        #expect(abs(top.x - 150) < 1e-9 && abs(top.y - 50) < 1e-9)
        #expect(abs(left.x - 50) < 1e-9 && abs(left.y - 150) < 1e-9)
        #expect(abs(bottom.x - 150) < 1e-9 && abs(bottom.y - 250) < 1e-9)
    }

    @Test func theRingsKeepTheDesignMeasures() {
        #expect(HalfDonutPresentation.visibleWidth == 150)
        #expect(HalfDonutPresentation.visibleHeight == 300)
        #expect(HalfDonutPresentation.outerDiameter == 300)
        #expect(HalfDonutPresentation.outerInnerRatio == 0.74)
        #expect(HalfDonutPresentation.innerDiameter == 208)
        #expect(HalfDonutPresentation.innerInnerRatio == 0.80)
        #expect(HalfDonutPresentation.innerOpacity == 0.4)
    }
}
