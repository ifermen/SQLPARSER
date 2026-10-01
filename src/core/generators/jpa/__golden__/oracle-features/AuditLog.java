package com.example.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "order#")
    private Integer order;

    @Column(name = "event_type", length = 30)
    private String eventType;

    @Lob
    @Column(name = "payload")
    private String payload;

    @Lob
    @Column(name = "attachment")
    private byte[] attachment;

    @Column(name = "checksum", length = 16)
    private byte[] checksum;

    @Column(name = "legacy_blob")
    private byte[] legacyBlob;

    @Column(name = "ratio")
    private Double ratio;

    @Column(name = "score")
    private Double score;

    @Column(name = "logged_at")
    private OffsetDateTime loggedAt;

    @Column(name = "logged_on")
    private LocalDateTime loggedOn;

    @Column(name = "retention")
    private String retention;

    @Column(name = "row_ref")
    private String rowRef;

    @Column(name = "metadata")
    private String metadata;

    @OneToMany(mappedBy = "auditLog")
    private List<LegacyCustomer> legacyCustomers = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = payload;
    }

    public byte[] getAttachment() {
        return attachment;
    }

    public void setAttachment(byte[] attachment) {
        this.attachment = attachment;
    }

    public byte[] getChecksum() {
        return checksum;
    }

    public void setChecksum(byte[] checksum) {
        this.checksum = checksum;
    }

    public byte[] getLegacyBlob() {
        return legacyBlob;
    }

    public void setLegacyBlob(byte[] legacyBlob) {
        this.legacyBlob = legacyBlob;
    }

    public Double getRatio() {
        return ratio;
    }

    public void setRatio(Double ratio) {
        this.ratio = ratio;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public OffsetDateTime getLoggedAt() {
        return loggedAt;
    }

    public void setLoggedAt(OffsetDateTime loggedAt) {
        this.loggedAt = loggedAt;
    }

    public LocalDateTime getLoggedOn() {
        return loggedOn;
    }

    public void setLoggedOn(LocalDateTime loggedOn) {
        this.loggedOn = loggedOn;
    }

    public String getRetention() {
        return retention;
    }

    public void setRetention(String retention) {
        this.retention = retention;
    }

    public String getRowRef() {
        return rowRef;
    }

    public void setRowRef(String rowRef) {
        this.rowRef = rowRef;
    }

    public String getMetadata() {
        return metadata;
    }

    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }

    public List<LegacyCustomer> getLegacyCustomers() {
        return legacyCustomers;
    }

    public void setLegacyCustomers(List<LegacyCustomer> legacyCustomers) {
        this.legacyCustomers = legacyCustomers;
    }
}
