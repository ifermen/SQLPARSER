package com.example.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "book_author")
@IdClass(BookAuthorId.class)
public class BookAuthor {

    @Id
    @Column(name = "book_id", nullable = false)
    private Integer bookId;

    @Id
    @Column(name = "author_id", nullable = false)
    private Integer authorId;

    @Column(name = "author_order", nullable = false)
    private Short authorOrder;

    @Column(name = "royalty_pct", precision = 5, scale = 2)
    private BigDecimal royaltyPct;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "book_id", nullable = false, insertable = false, updatable = false)
    private Book book;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false, insertable = false, updatable = false)
    private Author author;

    public Integer getBookId() {
        return bookId;
    }

    public void setBookId(Integer bookId) {
        this.bookId = bookId;
    }

    public Integer getAuthorId() {
        return authorId;
    }

    public void setAuthorId(Integer authorId) {
        this.authorId = authorId;
    }

    public Short getAuthorOrder() {
        return authorOrder;
    }

    public void setAuthorOrder(Short authorOrder) {
        this.authorOrder = authorOrder;
    }

    public BigDecimal getRoyaltyPct() {
        return royaltyPct;
    }

    public void setRoyaltyPct(BigDecimal royaltyPct) {
        this.royaltyPct = royaltyPct;
    }

    public Book getBook() {
        return book;
    }

    public void setBook(Book book) {
        this.book = book;
    }

    public Author getAuthor() {
        return author;
    }

    public void setAuthor(Author author) {
        this.author = author;
    }
}
