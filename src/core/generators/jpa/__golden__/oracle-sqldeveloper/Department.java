package com.example.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

/**
 * Departments table that shows details of departments where employees work.
 */
@Entity
@Table(name = "DEPARTMENTS")
public class Department {

    @Id
    @Column(name = "DEPARTMENT_ID", nullable = false)
    private Short departmentId;

    /**
     * A not null column that shows name of a department.
     */
    @Column(name = "DEPARTMENT_NAME", nullable = false, length = 30)
    private String departmentName;

    @Column(name = "LOCATION_ID")
    private Short locationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "MANAGER_ID")
    private Employee employee;

    @OneToMany(mappedBy = "department")
    private List<Employee> employees = new ArrayList<>();

    public Short getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(Short departmentId) {
        this.departmentId = departmentId;
    }

    public String getDepartmentName() {
        return departmentName;
    }

    public void setDepartmentName(String departmentName) {
        this.departmentName = departmentName;
    }

    public Short getLocationId() {
        return locationId;
    }

    public void setLocationId(Short locationId) {
        this.locationId = locationId;
    }

    public Employee getEmployee() {
        return employee;
    }

    public void setEmployee(Employee employee) {
        this.employee = employee;
    }

    public List<Employee> getEmployees() {
        return employees;
    }

    public void setEmployees(List<Employee> employees) {
        this.employees = employees;
    }
}
